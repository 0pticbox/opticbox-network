import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} from './supabase-config.js';

const PRODUCTS = Object.freeze({
  opticscope: '0PTICSCOPE',
  '0ps3': '0PS3 Visualizer',
  spectravault: 'SPECTRAVAULT',
  distortion: 'DISTORTION',
  'dj-visual-studio': 'DJ Visual Studio',
  'boxed-arp': 'BOXED ARP',
  'orbital-repair': 'Orbital Repair',
  'inner-light-runner': 'Inner Light Runner',
});

const configured = isSupabaseConfigured();
let supabase = null;
let activeUser = null;
let activeProfile = null;
let currentReview = null;
let selectedProduct = 'opticscope';

const configWarning = document.getElementById('member-config-warning');
const loggedOut = document.getElementById('member-logged-out');
const loggedIn = document.getElementById('member-logged-in');
const signInForm = document.getElementById('member-signin-form');
const signUpForm = document.getElementById('member-signup-form');
const signOutButton = document.getElementById('member-signout-button');
const nameForm = document.getElementById('member-name-form');
const nameInput = document.getElementById('member-display-name');
const taglineInput = document.getElementById('member-profile-tagline');
const statusInput = document.getElementById('member-profile-status');
const bioInput = document.getElementById('member-profile-bio');
const imageInput = document.getElementById('member-profile-image');
const backgroundInput = document.getElementById('member-background-image');
const removeBackgroundInput = document.getElementById('member-remove-background');
const accentInput = document.getElementById('member-profile-accent');
const dimInput = document.getElementById('member-profile-dim');
const instagramInput = document.getElementById('member-instagram-url');
const youtubeInput = document.getElementById('member-youtube-url');
const viewProfileLink = document.getElementById('member-view-profile');
const sessionAvatar = document.getElementById('member-session-avatar');
const sessionName = document.getElementById('member-session-name');
const sessionEmail = document.getElementById('member-session-email');
const authMessage = document.getElementById('member-auth-message');
const productSelect = document.getElementById('review-product');
const reviewForm = document.getElementById('review-form');
const reviewComment = document.getElementById('review-comment');
const reviewCharacterCount = document.getElementById('review-character-count');
const reviewMessage = document.getElementById('review-message');
const deleteReviewButton = document.getElementById('delete-review-button');
const reviewLoginNote = document.getElementById('review-login-note');
const reviewsRoot = document.getElementById('product-reviews');
const publicReviewCount = document.getElementById('public-review-count');
const reviewListHeading = document.getElementById('review-list-heading');
const selectedAverage = document.getElementById('selected-average');
const selectedStars = document.getElementById('selected-stars');
const selectedReviewCount = document.getElementById('selected-review-count');
const ownerAccess = document.getElementById('member-owner-access');

function setMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function starText(value) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
}

function profileNameFromReview(review) {
  const relation = review?.profiles;
  if (Array.isArray(relation)) return relation[0]?.display_name || 'Member';
  return relation?.display_name || 'Member';
}

function fallbackDisplayName(user) {
  const metadataName = user?.user_metadata?.display_name;
  if (typeof metadataName === 'string' && metadataName.trim().length >= 2) {
    return metadataName.trim().slice(0, 32);
  }
  const emailName = user?.email?.split('@')[0]?.trim();
  return (emailName || 'Member').slice(0, 32);
}

async function ensureProfile(user) {
  if (!supabase || !user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const profile = {
    id: user.id,
    display_name: fallbackDisplayName(user),
    bio: '',
    status: '',
    avatar_url: '',
    background_url: '',
    background_dim: 62,
    accent_color: '#ff6b36',
    profile_tagline: '',
    instagram_url: '',
    youtube_url: '',
  };
  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert(profile)
    .select('id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url')
    .single();
  if (insertError) throw insertError;
  return inserted;
}

function updateSessionUi() {
  const signedIn = Boolean(activeUser);
  if (loggedOut) loggedOut.hidden = signedIn;
  if (loggedIn) loggedIn.hidden = !signedIn;
  if (reviewForm) reviewForm.hidden = !signedIn;
  if (reviewLoginNote) reviewLoginNote.hidden = signedIn;
  if (ownerAccess && !signedIn) ownerAccess.hidden = true;

  if (signedIn) {
    const displayName = activeProfile?.display_name || fallbackDisplayName(activeUser);
    if (sessionName) sessionName.textContent = displayName;
    if (sessionEmail) sessionEmail.textContent = activeUser.email || '';
    if (sessionAvatar) {
      sessionAvatar.replaceChildren();
      if (activeProfile?.avatar_url) {
        const avatarImage = document.createElement('img');
        avatarImage.src = activeProfile.avatar_url;
        avatarImage.alt = '';
        sessionAvatar.append(avatarImage);
      } else {
        sessionAvatar.textContent = displayName.slice(0, 1).toUpperCase();
      }
    }
    if (nameInput) nameInput.value = displayName;
    if (taglineInput) taglineInput.value = activeProfile?.profile_tagline || '';
    if (statusInput) statusInput.value = activeProfile?.status || '';
    if (bioInput) bioInput.value = activeProfile?.bio || '';
    if (accentInput) accentInput.value = /^#[0-9a-f]{6}$/i.test(activeProfile?.accent_color || '') ? activeProfile.accent_color : '#ff6b36';
    if (dimInput) dimInput.value = String(Math.max(20, Math.min(90, Number(activeProfile?.background_dim) || 62)));
    if (instagramInput) instagramInput.value = activeProfile?.instagram_url || '';
    if (youtubeInput) youtubeInput.value = activeProfile?.youtube_url || '';
    if (removeBackgroundInput) removeBackgroundInput.checked = false;
    if (viewProfileLink) { viewProfileLink.hidden = false; viewProfileLink.href = `profile.html?id=${encodeURIComponent(activeUser.id)}`; }
  }
}

function resetReviewEditor() {
  reviewForm?.reset();
  if (reviewCharacterCount) reviewCharacterCount.textContent = '0';
  if (deleteReviewButton) deleteReviewButton.hidden = true;
  currentReview = null;
  setMessage(reviewMessage, '');
  reviewForm?.querySelectorAll('input,textarea,button[type="submit"]').forEach((element) => {
    element.disabled = false;
  });
}

function fillReviewEditor(review) {
  resetReviewEditor();
  currentReview = review || null;
  if (!review) return;

  const radio = reviewForm?.querySelector(`input[name="rating"][value="${review.rating}"]`);
  if (radio) radio.checked = true;
  if (reviewComment) reviewComment.value = review.comment || '';
  if (reviewCharacterCount) reviewCharacterCount.textContent = String((review.comment || '').length);
  if (deleteReviewButton) deleteReviewButton.hidden = false;

  if (review.visible === false) {
    reviewForm?.querySelectorAll('input,textarea,button[type="submit"]').forEach((element) => {
      element.disabled = true;
    });
    if (deleteReviewButton) deleteReviewButton.disabled = false;
    setMessage(reviewMessage, 'This review is hidden by moderation. You can delete it, but it cannot be edited.', true);
  } else {
    setMessage(reviewMessage, 'Editing your existing review for this product.');
  }
}

function renderReviews(reviews) {
  if (!reviewsRoot) return;
  reviewsRoot.replaceChildren();
  if (publicReviewCount) publicReviewCount.textContent = String(reviews.length);
  if (reviewListHeading) reviewListHeading.textContent = `${PRODUCTS[selectedProduct]} comments`;

  if (!reviews.length) {
    const empty = document.createElement('p');
    empty.className = 'review-empty';
    empty.textContent = 'No comments yet. You could be first.';
    reviewsRoot.append(empty);
    return;
  }

  for (const review of reviews) {
    const article = document.createElement('article');
    article.className = 'member-review';

    const header = document.createElement('div');
    header.className = 'member-review-header';
    const identity = document.createElement('a');
    identity.className = 'member-review-identity';
    const relation = Array.isArray(review?.profiles) ? review.profiles[0] : review?.profiles;
    identity.href = relation?.id ? `profile.html?id=${encodeURIComponent(relation.id)}` : 'members.html';
    const avatar = document.createElement('span');
    avatar.className = 'member-review-avatar';
    if (relation?.avatar_url) {
      const img = document.createElement('img');
      img.src = relation.avatar_url;
      img.alt = '';
      img.loading = 'lazy';
      avatar.append(img);
    } else {
      avatar.textContent = profileNameFromReview(review).slice(0, 1).toUpperCase();
    }
    const identityCopy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = profileNameFromReview(review);
    const date = document.createElement('small');
    date.textContent = formatDate(review.updated_at || review.created_at);
    identityCopy.append(name, date);
    identity.append(avatar, identityCopy);

    const stars = document.createElement('span');
    stars.className = 'member-review-stars';
    stars.textContent = starText(review.rating);
    stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
    header.append(identity, stars);

    const comment = document.createElement('p');
    comment.textContent = review.comment || '';
    article.append(header, comment);
    reviewsRoot.append(article);
  }
}

function renderSummaries(rows) {
  const byProduct = new Map();
  for (const row of rows || []) {
    if (!PRODUCTS[row.product_slug]) continue;
    const entry = byProduct.get(row.product_slug) || { total: 0, count: 0 };
    entry.total += Number(row.rating) || 0;
    entry.count += 1;
    byProduct.set(row.product_slug, entry);
  }

  document.querySelectorAll('[data-product-rating]').forEach((summary) => {
    const slug = summary.dataset.productRating;
    const entry = byProduct.get(slug);
    const stars = summary.querySelector('span');
    const copy = summary.querySelector('small');
    if (!entry) {
      if (stars) stars.textContent = '☆☆☆☆☆';
      if (copy) copy.textContent = 'No ratings yet';
      return;
    }
    const average = entry.total / entry.count;
    if (stars) stars.textContent = starText(average);
    if (copy) copy.textContent = `${average.toFixed(1)} · ${entry.count}`;
  });

  const selected = byProduct.get(selectedProduct);
  if (!selected) {
    if (selectedAverage) selectedAverage.textContent = 'New';
    if (selectedStars) selectedStars.textContent = '☆☆☆☆☆';
    if (selectedReviewCount) selectedReviewCount.textContent = 'No ratings yet';
    return;
  }
  const average = selected.total / selected.count;
  if (selectedAverage) selectedAverage.textContent = average.toFixed(1);
  if (selectedStars) selectedStars.textContent = starText(average);
  if (selectedReviewCount) {
    selectedReviewCount.textContent = `${selected.count} ${selected.count === 1 ? 'rating' : 'ratings'}`;
  }
}

async function loadSummaries() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('product_reviews')
    .select('product_slug,rating')
    .eq('visible', true)
    .limit(1000);
  if (error) throw error;
  renderSummaries(data || []);
}

async function loadSelectedReviews() {
  if (!supabase) return;
  const publicQuery = supabase
    .from('product_reviews')
    .select('id,product_slug,user_id,rating,comment,visible,created_at,updated_at,profiles(id,display_name,avatar_url)')
    .eq('product_slug', selectedProduct)
    .eq('visible', true)
    .order('updated_at', { ascending: false })
    .limit(30);

  const ownQuery = activeUser
    ? supabase
      .from('product_reviews')
      .select('id,product_slug,user_id,rating,comment,visible,created_at,updated_at')
      .eq('product_slug', selectedProduct)
      .eq('user_id', activeUser.id)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [publicResult, ownResult] = await Promise.all([publicQuery, ownQuery]);
  if (publicResult.error) throw publicResult.error;
  if (ownResult.error) throw ownResult.error;
  renderReviews(publicResult.data || []);
  if (activeUser) fillReviewEditor(ownResult.data || null);
}


async function refreshOwnerAccess() {
  if (!ownerAccess || !supabase || !activeUser) {
    if (ownerAccess) ownerAccess.hidden = true;
    return;
  }

  const { data, error } = await supabase
    .from('site_admins')
    .select('user_id')
    .eq('user_id', activeUser.id)
    .maybeSingle();

  if (error) {
    console.warn('Could not verify owner access:', error);
    ownerAccess.hidden = true;
    return;
  }

  ownerAccess.hidden = !data;
}

async function refreshReviews() {
  try {
    await Promise.all([loadSummaries(), loadSelectedReviews()]);
  } catch (error) {
    console.warn('Could not load ratings:', error);
    setMessage(reviewMessage, 'Ratings could not load. Check the Supabase setup and try again.', true);
  }
}

async function handleSession(session) {
  activeUser = session?.user || null;
  activeProfile = null;
  if (activeUser) {
    try {
      activeProfile = await ensureProfile(activeUser);
      setMessage(authMessage, `Signed in as ${activeProfile.display_name}.`);
    } catch (error) {
      setMessage(authMessage, error.message || 'Your profile could not be loaded.', true);
    }
  }
  updateSessionUi();
  await refreshOwnerAccess();
  await loadSelectedReviews().catch((error) => {
    console.warn('Could not load member review:', error);
  });
}

if (!configured) {
  if (configWarning) configWarning.hidden = false;
  document.querySelectorAll('#member-logged-out input,#member-logged-out button,#review-product').forEach((element) => {
    element.disabled = true;
  });
  setMessage(authMessage, 'Connect Supabase to turn on member accounts, ratings, and comments.', true);
} else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const { data } = await supabase.auth.getSession();
  await handleSession(data.session);
  await refreshReviews();

  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handleSession(session).catch((error) => console.warn('Auth state failed:', error));
    }, 0);
  });
}

signInForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;
  setMessage(authMessage, 'Signing in…');
  const email = document.getElementById('member-signin-email').value.trim();
  const password = document.getElementById('member-signin-password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setMessage(authMessage, error.message, true);
    return;
  }
  signInForm.reset();
  await handleSession(data.session);
});

signUpForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;
  setMessage(authMessage, 'Creating your account…');
  const displayName = document.getElementById('member-signup-name').value.trim();
  const email = document.getElementById('member-signup-email').value.trim();
  const password = document.getElementById('member-signup-password').value;
  const redirectTo = new URL('./', window.location.href).href;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: redirectTo },
  });
  if (error) {
    setMessage(authMessage, error.message, true);
    return;
  }
  signUpForm.reset();
  if (data.session) {
    await handleSession(data.session);
  } else {
    setMessage(authMessage, 'Account created. Check your email to confirm it, then come back and sign in.');
  }
});

signOutButton?.addEventListener('click', async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  activeUser = null;
  activeProfile = null;
  resetReviewEditor();
  updateSessionUi();
  setMessage(authMessage, 'Signed out.');
  await refreshReviews();
});

nameForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !activeUser) return;
  const displayName = nameInput.value.trim();
  const tagline = taglineInput?.value.trim() || '';
  const status = statusInput?.value.trim() || '';
  const bio = bioInput?.value.trim() || '';
  const accentColor = /^#[0-9a-f]{6}$/i.test(accentInput?.value || '')
    ? accentInput.value
    : '#ff6b36';
  const backgroundDim = Math.max(20, Math.min(90, Number(dimInput?.value) || 62));
  const instagramUrl = instagramInput?.value.trim() || '';
  const youtubeUrl = youtubeInput?.value.trim() || '';
  if (displayName.length < 2) {
    setMessage(authMessage, 'Display names need at least 2 characters.', true);
    return;
  }

  setMessage(authMessage, 'Saving your profile…');
  let avatarUrl = activeProfile?.avatar_url || '';
  let backgroundUrl = removeBackgroundInput?.checked
    ? ''
    : (activeProfile?.background_url || '');
  const file = imageInput?.files?.[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      setMessage(authMessage, 'Profile pictures must be 5 MB or smaller.', true);
      return;
    }
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${activeUser.id}/avatar-${Date.now()}.${extension || 'jpg'}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (uploadError) {
      setMessage(authMessage, uploadError.message, true);
      return;
    }
    const { data: publicData } = supabase.storage.from('profile-images').getPublicUrl(path);
    avatarUrl = publicData.publicUrl;
  }

  const backgroundFile = backgroundInput?.files?.[0];
  if (backgroundFile) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(backgroundFile.type)) {
      setMessage(authMessage, 'Backgrounds must be PNG, JPG, WEBP, or GIF.', true);
      return;
    }
    if (backgroundFile.size > 8 * 1024 * 1024) {
      setMessage(authMessage, 'Profile backgrounds must be 8 MB or smaller.', true);
      return;
    }
    const extension = (backgroundFile.name.split('.').pop() || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const path = `${activeUser.id}/background-${Date.now()}.${extension || 'jpg'}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(path, backgroundFile, {
        cacheControl: '3600',
        upsert: true,
        contentType: backgroundFile.type,
      });
    if (uploadError) {
      setMessage(authMessage, uploadError.message, true);
      return;
    }
    const { data: publicData } = supabase.storage.from('profile-images').getPublicUrl(path);
    backgroundUrl = publicData.publicUrl;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      profile_tagline: tagline,
      status,
      bio,
      avatar_url: avatarUrl,
      background_url: backgroundUrl,
      background_dim: backgroundDim,
      accent_color: accentColor,
      instagram_url: instagramUrl,
      youtube_url: youtubeUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeUser.id)
    .select('id,display_name,bio,status,avatar_url,background_url,background_dim,accent_color,profile_tagline,instagram_url,youtube_url')
    .single();
  if (error) {
    setMessage(authMessage, error.message, true);
    return;
  }
  activeProfile = data;
  if (imageInput) imageInput.value = '';
  if (backgroundInput) backgroundInput.value = '';
  if (removeBackgroundInput) removeBackgroundInput.checked = false;
  updateSessionUi();
  setMessage(authMessage, 'Profile saved. Your member page is live.');
  await loadSelectedReviews();
});

productSelect?.addEventListener('change', async () => {
  if (!PRODUCTS[productSelect.value]) return;
  selectedProduct = productSelect.value;
  resetReviewEditor();
  await refreshReviews();
});

reviewComment?.addEventListener('input', () => {
  if (reviewCharacterCount) reviewCharacterCount.textContent = String(reviewComment.value.length);
});

reviewForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !activeUser) return;
  const selectedRating = reviewForm.querySelector('input[name="rating"]:checked');
  const comment = reviewComment.value.trim();
  if (!selectedRating) {
    setMessage(reviewMessage, 'Choose one to five stars.', true);
    return;
  }
  if (!comment) {
    setMessage(reviewMessage, 'Add a short comment before saving.', true);
    return;
  }

  setMessage(reviewMessage, 'Saving…');
  const payload = {
    user_id: activeUser.id,
    product_slug: selectedProduct,
    rating: Number(selectedRating.value),
    comment,
    visible: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('product_reviews')
    .upsert(payload, { onConflict: 'user_id,product_slug' });
  if (error) {
    setMessage(reviewMessage, error.message, true);
    return;
  }
  setMessage(reviewMessage, 'Review saved.');
  await refreshReviews();
});

deleteReviewButton?.addEventListener('click', async () => {
  if (!supabase || !activeUser || !currentReview) return;
  const confirmed = window.confirm(`Delete your review of ${PRODUCTS[selectedProduct]}?`);
  if (!confirmed) return;
  const { error } = await supabase
    .from('product_reviews')
    .delete()
    .eq('id', currentReview.id)
    .eq('user_id', activeUser.id);
  if (error) {
    setMessage(reviewMessage, error.message, true);
    return;
  }
  resetReviewEditor();
  setMessage(reviewMessage, 'Review deleted.');
  await refreshReviews();
});

document.querySelectorAll('[data-product-rating]').forEach((summary) => {
  summary.addEventListener('click', async () => {
    const slug = summary.dataset.productRating;
    if (!PRODUCTS[slug] || !productSelect) return;
    selectedProduct = slug;
    productSelect.value = slug;
    document.getElementById('members')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await refreshReviews();
  });
});

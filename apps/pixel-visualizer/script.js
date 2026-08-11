(() => {
  const parts = [
    "./engine-part1.txt?v=3",
    "./engine-part2.txt?v=3",
    "./engine-part3.txt?v=3",
    "./engine-part4.txt?v=3"
  ];

  Promise.all(parts.map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
    return response.text();
  }))
    .then((chunks) => {
      const source = chunks.join("");
      const blob = new Blob([source], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const engine = document.createElement("script");
      engine.src = blobUrl;
      engine.onload = () => URL.revokeObjectURL(blobUrl);
      engine.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        console.error("Pixel Visualizer engine failed to start.");
      };
      document.head.appendChild(engine);
    })
    .catch((error) => {
      console.error("Pixel Visualizer engine load failed:", error);
      const badge = document.getElementById("connectionBadge");
      const title = document.getElementById("statusTitle");
      const text = document.getElementById("statusText");
      if (badge) badge.textContent = "ERROR";
      if (title) title.textContent = "ENGINE LOAD FAILED";
      if (text) text.textContent = error.message;
    });
})();

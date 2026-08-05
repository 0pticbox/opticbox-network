pico-8 cartridge // http://www.pico-8.com
version 41
__lua__
--================================
-- tab 1: main / init
--================================

function _init()

 --remember whether the boot intro
 --has already played this run
 if intro_seen==nil then
  intro_seen=false
 end

 --intro sequence
 intro_active=not intro_seen
 intro_timer=0
 intro_chime_played=false
 intro_controls=false

 --game state
 game_state="playing"
 level=1
 level_frames=0
 level_length=30*60

 --systems
 selected_system=1
 active_systems=3

 systems={
  {
   name="power",
   level=100,
   drain=0.032
  },
  {
   name="comms",
   level=100,
   drain=0.027
  },
  {
   name="oxygen",
   level=100,
   drain=0.030
  },
  {
   name="thermal",
   level=100,
   drain=0.034
  },
  {
   name="navigation",
   level=100,
   drain=0.029
  }
 }

 --repair strength
 refill_speed=0.18

 --visor
 visor_up=false
 visor_y=128
 visor_target_y=128
 visor_flips=0
 visor_rattle_cooldown=0

 --horror entity
 entity_stage=0
 entity_x=104
 entity_y=32
 entity_scale=1

 --the entity only creeps closer
 --while a system is below 75%
 --restoring every system above
 --75% pushes it back one step
 entity_health_threshold=75
 entity_health_was_good=true

 --mouth animation
 mouth_frame=0
 mouth_timer=0
 mouth_open=false

 --effects
 screen_flash=0
 shake=0
 warning_timer=0
 transition_timer=0
 ammo_message_timer=0
 ammo_flash=0

 --asteroid debris particles
 particles={}

 --stars
 stars={}

 for i=1,45 do
  add(stars,{
   x=rnd(128),
   y=rnd(104),
   speed=0.03+rnd(0.1),
   col=5+flr(rnd(3))
  })
 end

 --mouse support
 poke(0x5f2d,1)
 mouse_x=64
 mouse_y=64
 mouse_was_down=false

 --ammo
 --begin with 3 rounds, but earn
 --up to 6 through maintenance
 max_shots=6
 shots_left=3
 ammo_charge=0
 ammo_charge_needed=180
 ammo_health_threshold=75

 --asteroids
 asteroids={}
 asteroid_spawn_rate=300
 asteroid_spawn_timer=300

 --gun
 shot_flash=0
 shot_x=64
 shot_y=64

 --jumpscare audio
 jumpscare_pulse_timer=0
 mouth_sfx_state=false
 jumpscare_timer=0

 --dynamic horror music
 --safe: one quiet drone channel
 --tense: full atmospheric layer
 --panic: faster danger patterns
 music_state="safe"

 --small visor animation clock
 ui_anim_timer=0

 --short arcade story scenes
 --after levels 4, 8, 12, and 20
 cutscene_active=false
 cutscene_timer=0
 cutscene_length=0
 cutscene_level=0
 cutscene_type=0

 --hold the music until the
 --intro sequence is finished
 if intro_active then
  music(-1)
 else
  music(1,1200,4)
 end
end
-->8
--================================
-- tab 2: update
--================================

function _update60()

 --the forest-game style intro
 --runs before gameplay begins
 if intro_active then
  update_intro()
  update_effects()
  return
 end

 --short story scene
 --between selected rounds
 if cutscene_active then
  update_cutscene()
  update_effects()
  return
 end

 if game_state=="playing" then

  update_mouse()
  update_controls()
  update_visor()
  update_systems()
  update_ammo_fabricator()
  update_level()
  update_world()
  update_entity()
  update_asteroids()
  update_particles()
  update_gun()
  update_music()
  check_failure()

 elseif game_state=="complete" then

  update_complete_screen()

 else

  update_end_screen()

 end

 update_effects()
end



--================================
-- intro sequence
--================================

function update_intro()

 intro_timer+=1
 update_world()

 --soft production chime
 if intro_timer==70
 and not intro_chime_played then
  intro_chime_played=true
  sfx(1,2)
 end

 --open the controls panel after
 --the title sequence settles
 if intro_timer>=260 then
  intro_controls=true
 end

 --leave the controls visible for
 --one second before starting
 if intro_controls
 and intro_timer>=320
 and btnp(5) then
  start_game()
 end
end


function start_game()

 intro_active=false
 intro_seen=true
 intro_timer=0

 music_state="safe"
 music(1,1200,4)

 screen_flash=6
end

--================================
-- controls
--================================

function update_controls()

 --select systems while
 --the visor is lowered
 if not visor_up then

  if btnp(0) then

   selected_system-=1

   if selected_system<1 then
    selected_system=active_systems
   end
  end

  if btnp(1) then

   selected_system+=1

   if selected_system>active_systems then
    selected_system=1
   end
  end
 end

 --raise or lower visor
 if btnp(5) then
  toggle_visor()
 end
end


--================================
-- visor
--================================

function update_visor()

 visor_y+=
  (visor_target_y-visor_y)*0.18

 if abs(visor_target_y-visor_y)<0.5 then
  visor_y=visor_target_y
 end
end


function toggle_visor()

 visor_up=not visor_up
 visor_flips+=1

 if visor_up then

  visor_target_y=25

 else

  visor_target_y=128
  advance_entity()

 end

 --visor raise/lower
 sfx(0)
end


--================================
-- maintenance systems
--================================

function update_systems()

 local difficulty=
  1+((level-1)*0.16)

 --drain every active system
 for i=1,active_systems do

  local system=systems[i]

  system.level-=
   system.drain*difficulty

  system.level=
   mid(0,system.level,100)

  if system.level<25 then
   warning_timer=10
  end
 end

 --maintain selected system
 if visor_up and btn(4) then

  local system=
   systems[selected_system]

  system.level+=refill_speed

  system.level=
   mid(0,system.level,100)

  shake=max(shake,0.35)

  --mechanical visor rattle
  play_visor_rattle()
 end
end


--================================
-- ammo fabricator
--================================

function update_ammo_fabricator()

 --no need to charge while full
 if shots_left>=max_shots then
  ammo_charge=0
  return
 end

 local systems_healthy=true

 for i=1,active_systems do
  if systems[i].level<
   ammo_health_threshold then
   systems_healthy=false
  end
 end

 --route stable maintenance power
 --into the emergency fabricator
 if visor_up
 and btn(4)
 and systems_healthy then

  ammo_charge+=1

 else

  --losing stability slowly drains
  --the unfinished fabrication
  ammo_charge=
   max(0,ammo_charge-0.5)

 end

 if ammo_charge>=
  ammo_charge_needed then

  ammo_charge=0
  shots_left=
   min(max_shots,shots_left+1)

  ammo_message_timer=90
  ammo_flash=10

  --reuse the clean reward chime
  sfx(1,2)
 end
end


--================================
-- level progression
--================================

function update_level()

 level_frames+=1

 if level_frames>=level_length then
  next_level()
 end
end


function next_level()

 local scene_type=0

 --story scenes happen only after
 --these completed levels
 if level==4 then
  scene_type=1
 elseif level==8 then
  scene_type=2
 elseif level==12 then
  scene_type=3
 elseif level==20 then
  scene_type=4
 end

 if scene_type>0 then
  start_cutscene(scene_type)
 else
  finish_level_advance()
 end
end


function finish_level_advance()

 level+=1
 level_frames=0

 transition_timer=90
 screen_flash=8

 --every round guarantees three,
 --but earned extra rounds remain
 shots_left=max(3,shots_left)
 ammo_charge=0

 --remove old asteroids
 asteroids={}
 particles={}

 --gradually increase frequency,
 --but keep asteroids spaced out
 asteroid_spawn_rate=
  max(140,300-(level*15))

 asteroid_spawn_timer=
  asteroid_spawn_rate

 --small system recovery
 for i=1,active_systems do

  systems[i].level=
   min(
    100,
    systems[i].level+20
   )
 end

 --level complete
 sfx(1)
end


--================================
-- story cutscenes
--================================

function start_cutscene(scene_type)

 cutscene_active=true
 cutscene_timer=0
 cutscene_level=level
 cutscene_type=scene_type

 --each vignette has its own pace
 if cutscene_type==1 then
  cutscene_length=300
 elseif cutscene_type==2 then
  cutscene_length=360
 elseif cutscene_type==3 then
  cutscene_length=360
 else
  cutscene_length=480
 end

 --nothing can hit the player
 --while a scene is playing
 asteroids={}
 particles={}

 visor_up=false
 visor_y=128
 visor_target_y=128

 --let each scene breathe
 music(-1,500)
end


function update_cutscene()

 cutscene_timer+=1
 update_world()

 --small landing chime during
 --the final homecoming scene
 if cutscene_type==4
 and cutscene_timer==320 then
  sfx(1,2)
 end

 --no skip prompt or button:
 --every scene plays to the end
 if cutscene_timer>=cutscene_length then
  end_cutscene()
 end
end


function end_cutscene()

 local finished_scene=cutscene_type

 cutscene_active=false
 cutscene_timer=0
 cutscene_type=0

 --level 20 is the true ending
 if finished_scene==4 then
  game_state="complete"
  music(-1)
  return
 end

 --the next level begins only
 --after the scene has finished
 finish_level_advance()

 music_state="safe"
 music(1,1200,4)
end


function update_complete_screen()

 --restart the whole experience
 --after the final homecoming
 if btnp(5) then
  intro_seen=false
  _init()
 end
end

--================================
-- world
--================================

function update_world()

 for star in all(stars) do

  star.x-=star.speed

  if star.x<0 then

   star.x=128
   star.y=rnd(104)

  end
 end
end


--================================
-- distant entity
--================================

function all_systems_above(value)

 for i=1,active_systems do

  if systems[i].level<=value then
   return false
  end
 end

 return true
end


function set_entity_position()

 --default distant position
 entity_x=104
 entity_y=32
 entity_scale=1

 if entity_stage>=3 then
  entity_x=102
  entity_y=33
  entity_scale=2
 end

 if entity_stage>=6 then
  entity_x=98
  entity_y=36
  entity_scale=3
 end

 if entity_stage>=9 then
  entity_x=92
  entity_y=40
  entity_scale=4
 end

 if entity_stage>=12 then
  entity_x=82
  entity_y=46
  entity_scale=6
 end
end


function advance_entity()

 --the creature cannot creep
 --closer while every system is
 --being kept above 75 percent
 if all_systems_above(
  entity_health_threshold
 ) then
  return
 end

 entity_stage=
  min(12,entity_stage+1)

 set_entity_position()
end


function retreat_entity()

 if entity_stage>=12 then
  entity_stage=9
 elseif entity_stage>=9 then
  entity_stage=6
 elseif entity_stage>=6 then
  entity_stage=3
 elseif entity_stage>=3 then
  entity_stage=1
 else
  entity_stage=0
 end

 set_entity_position()

 --close the mouth as it recoils
 mouth_open=false
 mouth_timer=0
end


function update_entity()

 local systems_healthy=
  all_systems_above(
   entity_health_threshold
  )

 --crossing back above 75 percent
 --pushes the creature backward
 --one visible distance step
 if systems_healthy
 and not entity_health_was_good then
  retreat_entity()
 end

 entity_health_was_good=
  systems_healthy

 if entity_stage<1 then
  return
 end

 mouth_timer+=1

 --mouth animates faster
 --as the entity approaches
 local mouth_speed=30

 if entity_stage>=6 then
  mouth_speed=20
 end

 if entity_stage>=10 then
  mouth_speed=12
 end

 if mouth_timer>=mouth_speed then

  mouth_timer=0
  mouth_open=not mouth_open

 end
end


--================================
-- mouse aiming
--================================

function update_mouse()

 mouse_x=stat(32)
 mouse_y=stat(33)

 mouse_x=mid(0,mouse_x,127)
 mouse_y=mid(0,mouse_y,127)
end


--================================
-- gun
--================================

function update_gun()

 if shot_flash>0 then
  shot_flash-=1
 end

 --gun only works while
 --the visor is lowered
 if visor_up then
  return
 end

 local mouse_buttons=stat(34)

 --left mouse button
 if band(mouse_buttons,1)==1 then

  --one shot per click
  if not mouse_was_down then
   fire_gun()
  end

  mouse_was_down=true

 else

  mouse_was_down=false

 end
end


function fire_gun()

 if shots_left<=0 then
  return
 end

 shots_left-=1

 shot_flash=5
 shot_x=mouse_x
 shot_y=mouse_y

 shake=max(shake,1)

 --check whether an
 --asteroid was hit
 for i=#asteroids,1,-1 do

  local asteroid=asteroids[i]

  local dx=
   mouse_x-asteroid.x

  local dy=
   mouse_y-asteroid.y

  local distance=
   sqrt(dx*dx+dy*dy)

  if distance<=asteroid.size+4 then

   spawn_asteroid_particles(
    asteroid.x,
    asteroid.y,
    asteroid.size
   )

   deli(asteroids,i)

   screen_flash=3

   --laser / asteroid hit
   sfx(3)

   return
  end
 end

 --laser miss
 sfx(3)
end


--================================
-- asteroids
--================================

function update_asteroids()

 asteroid_spawn_timer-=1

 if asteroid_spawn_timer<=0 then

  spawn_asteroid()

  --use the slower spawn rate
  asteroid_spawn_timer=
   asteroid_spawn_rate

 end

 for i=#asteroids,1,-1 do

  local asteroid=asteroids[i]

  asteroid.x+=asteroid.dx
  asteroid.y+=asteroid.dy

  asteroid.size+=
   asteroid.growth

  asteroid.rotation+=
   asteroid.rotation_speed

  --asteroid reaches player
  if asteroid.y>=108
  or asteroid.size>=13 then

   damage_systems(20)

   deli(asteroids,i)

   shake=4
   screen_flash=8
   warning_timer=30

   --visor rattle and impact
   play_visor_rattle()
   sfx(2,0)

  end
 end
end


function spawn_asteroid()

 local start_x=
  rnd(118)+5

 local start_y=-8

 --aim toward the player
 local target_x=
  64+rnd(30)-15

 local target_y=112

 local dx=
  target_x-start_x

 local dy=
  target_y-start_y

 local length=
  sqrt(dx*dx+dy*dy)

 local speed=
  0.12+(level*0.015)

 add(asteroids,{

  x=start_x,
  y=start_y,

  dx=(dx/length)*speed,
  dy=(dy/length)*speed,

  size=2,

  growth=
   0.008+(level*0.001),

  rotation=rnd(1),

  rotation_speed=
   0.003+rnd(0.006)

 })
end


function damage_systems(amount)

 for i=1,active_systems do

  systems[i].level-=amount

  systems[i].level=
   max(0,systems[i].level)

 end
end


--================================
-- asteroid debris particles
--================================

function spawn_asteroid_particles(x,y,size)

 local count=
  8+flr(size)

 for i=1,count do

  local angle=rnd(1)
  local speed=0.35+rnd(0.9)
  local life=18+flr(rnd(16))

  add(particles,{
   x=x,
   y=y,
   dx=cos(angle)*speed,
   dy=sin(angle)*speed,
   life=life,
   max_life=life,
   col=rnd(1)<0.35 and 10 or 6
  })
 end
end


function update_particles()

 for i=#particles,1,-1 do

  local particle=particles[i]

  particle.x+=particle.dx
  particle.y+=particle.dy

  particle.dx*=0.96
  particle.dy*=0.96

  particle.life-=1

  if particle.life<=0 then
   deli(particles,i)
  end
 end
end


--================================
-- dynamic music
--================================

function update_music()

 local total=0
 local lowest=100

 for i=1,active_systems do
  total+=systems[i].level
  lowest=min(lowest,systems[i].level)
 end

 local average=
  total/active_systems

 local asteroid_near=false
 local asteroid_close=false

 for asteroid in all(asteroids) do

  if asteroid.y>55
  or asteroid.size>6 then
   asteroid_near=true
  end

  if asteroid.y>88
  or asteroid.size>10 then
   asteroid_close=true
  end
 end

 --danger immediately overrides
 --the calmer music states
 local panic=
  average<42
  or lowest<25
  or asteroid_close

 if panic then

  if music_state!="panic" then
   music_state="panic"

   --fastest, fullest layer
   music(5,400,12)
  end

  return
 end

 --when everything is healthy and
 --space is clear, strip the song
 --down to a single quiet drone
 local safe=
  average>=85
  and lowest>=78
  and not asteroid_near

 if safe then

  if music_state!="safe" then
   music_state="safe"

   --channel 2 only: very calm
   music(1,1200,4)
  end

 else

  if music_state!="tense" then
   music_state="tense"

   --both atmospheric channels
   music(1,700,12)
  end
 end
end


--================================
-- failure / jumpscare
--================================

function check_failure()

 for i=1,active_systems do

  if systems[i].level<=0 then

   game_state="lost"

   failed_system=
    systems[i].name

   jumpscare_timer=180

   screen_flash=10
   shake=6

   --cut everything instantly
   --so the scare hits hard
   music(-1)
   sfx(-1)

   --layer a sharp impact under
   --the full jumpscare scream
   sfx(11,0)
   sfx(10,3)

   jumpscare_pulse_timer=0
   mouth_sfx_state=false

   return
  end
 end
end


function update_end_screen()

 if jumpscare_timer>0 then

  jumpscare_timer-=1
  shake=max(shake,2)

  --mouth snap timing
  jumpscare_pulse_timer+=1

  if jumpscare_pulse_timer>=18 then

   jumpscare_pulse_timer=0

   mouth_sfx_state=
    not mouth_sfx_state

   --play when mouth opens
   if mouth_sfx_state then
    sfx(5,2)
   end
  end

  return
 end

 --stop every scare sound
 sfx(-1)

 --restart
 if btnp(5) then
  _init()
 end
end


--================================
-- effects
--================================

function update_effects()

 ui_anim_timer+=1

 if screen_flash>0 then
  screen_flash-=1
 end

 if warning_timer>0 then
  warning_timer-=1
 end

 if transition_timer>0 then
  transition_timer-=1
 end

 if ammo_message_timer>0 then
  ammo_message_timer-=1
 end

 if ammo_flash>0 then
  ammo_flash-=1
 end

 if visor_rattle_cooldown>0 then
  visor_rattle_cooldown-=1
 end

 if shake>0 then

  shake*=0.8

  if shake<0.1 then
   shake=0
  end
 end
end


--================================
-- visor rattle sound
--================================

function play_visor_rattle()

 if visor_rattle_cooldown<=0 then

  --mechanical visor rattle
  sfx(6,1)

  visor_rattle_cooldown=35

 end
end
-->8
-- tab 3: draw
--================================

function _draw()

 if intro_active then
  draw_intro()
  return
 end

 if cutscene_active then
  draw_cutscene()
  return
 end

 if game_state=="complete" then
  draw_final_screen()
  return
 end

 cls(0)

 local sx=0
 local sy=0

 if shake>0 then
  sx=rnd(shake*2)-shake
  sy=rnd(shake*2)-shake
 end

 camera(sx,sy)

 draw_space()
 draw_entity()
 draw_asteroids()
 draw_particles()
 draw_system_markers()
 draw_astronaut_hands()
 draw_gun()
 draw_visor()
 draw_hud()
 draw_crosshair()

 camera()

 draw_warning_effect()
 draw_level_transition()
 draw_flash()
 draw_ammo_notice()

 if game_state=="lost" then

  if jumpscare_timer>0 then
   draw_jumpscare()
  else
   draw_lose_screen()
  end

 end
end
-- space
--================================

function draw_space()

 for star in all(stars) do
  pset(star.x,star.y,star.col)
 end

 --planet horizon
 circfill(64,157,52,1)
 circfill(64,160,49,12)

 --dark section
 ovalfill(25,114,103,168,1)

 --atmosphere
 line(33,119,95,119,6)
end


--================================
-- shadow entity
--================================

function draw_entity()

 if entity_stage<1 then
  return
 end

 local x=entity_x
 local y=entity_y
 local s=entity_scale

 --faint purple glow
 circ(x,y,s+6,2)

 if s>=3 then
  circ(x,y,s+8,1)
 end

 --uneven horn shapes
 line(
  x-s,
  y-s,
  x-s-2,
  y-s-5,
  0
 )

 line(
  x-s-2,
  y-s-5,
  x-s-4,
  y-s-7,
  0
 )

 line(
  x+s,
  y-s,
  x+s+3,
  y-s-4,
  0
 )

 line(
  x+s+3,
  y-s-4,
  x+s+2,
  y-s-8,
  0
 )

 --wide shadow head
 ovalfill(
  x-s-3,
  y-s-2,
  x+s+3,
  y+s+5,
  0
 )

 --irregular outer silhouette
 circfill(
  x-s-2,
  y,
  max(1,s/2),
  0
 )

 circfill(
  x+s+2,
  y+1,
  max(1,s/2),
  0
 )

 --ears / side spikes
 line(
  x-s-2,
  y,
  x-s-6,
  y-2,
  0
 )

 line(
  x+s+2,
  y,
  x+s+6,
  y-3,
  0
 )

 --eyes
 draw_entity_eyes(x,y,s)

 --animated mouth
 draw_entity_mouth(x,y,s)
end


function draw_entity_eyes(x,y,s)

 local eye_y=y-1
 local eye_gap=max(2,s/2)

 --purple eye glow
 circfill(
  x-eye_gap,
  eye_y,
  max(1,s/3),
  2
 )

 circfill(
  x+eye_gap,
  eye_y,
  max(1,s/3),
  2
 )

 --white centers
 pset(
  x-eye_gap,
  eye_y,
  7
 )

 pset(
  x+eye_gap,
  eye_y,
  7
 )

 --larger eyes when close
 if s>=4 then

  pset(
   x-eye_gap,
   eye_y-1,
   7
  )

  pset(
   x+eye_gap,
   eye_y-1,
   7
  )
 end
end

function draw_entity_mouth(x,y,s)

 local mouth_y=y+max(2,s/2)

 if mouth_open then

  --open black mouth
  ovalfill(
   x-s,
   mouth_y,
   x+s,
   mouth_y+s+3,
   0
  )

  --purple mouth interior
  ovalfill(
   x-s+1,
   mouth_y+1,
   x+s-1,
   mouth_y+s+2,
   2
  )

  --uneven teeth
  for tx=x-s+1,x+s-1,2 do

   local tooth_height=
    1+flr(rnd(3))

   line(
    tx,
    mouth_y,
    tx,
    mouth_y+tooth_height,
    7
   )
  end

  --lower dripping shapes
  for tx=x-s+1,x+s-1,3 do

   local drip=
    1+flr(rnd(3))

   line(
    tx,
    mouth_y+s+1,
    tx,
    mouth_y+s+1+drip,
    2
   )
  end

 else

  --closed jagged mouth
  local last_x=x-s
  local last_y=mouth_y

  for mx=x-s+1,x+s do

   local new_y=
    mouth_y+flr(rnd(3))-1

   line(
    last_x,
    last_y,
    mx,
    new_y,
    2
   )

   last_x=mx
   last_y=new_y
  end
 end
end
--================================
-- system markers
--================================

function draw_system_markers()

 local positions={
  {22,72},
  {64,62},
  {106,72},
  {42,87},
  {86,87}
 }

 for i=1,active_systems do

  local x=positions[i][1]
  local y=positions[i][2]
  local system=systems[i]
  local col=get_system_color(system)

  circ(x,y,5,col)
  pset(x,y,col)

  if i==selected_system then
   line(x-7,y+8,x+7,y+8,10)
  end
 end
end


--================================
-- astronaut hands
--================================

function draw_astronaut_hands()

 --left glove
 circfill(8,116,11,6)
 rectfill(0,116,18,127,6)

 rectfill(2,111,6,118,7)
 rectfill(7,108,11,118,7)
 rectfill(12,110,16,119,7)

 --right glove
 circfill(120,116,11,6)
 rectfill(110,116,127,127,6)

 rectfill(112,110,116,119,7)
 rectfill(117,108,121,118,7)
 rectfill(122,111,126,118,7)
end


--================================
-- visor display
--================================

function draw_visor()

 if visor_y>=127 then
  return
 end

 local y=visor_y
 local system=systems[selected_system]

 --visor body
 rectfill(7,y,120,y+92,1)
 rect(7,y,120,y+92,5)

 --screen
 rectfill(12,y+7,115,y+74,0)
 rect(12,y+7,115,y+74,6)

 --scan lines
 for scan_y=y+10,y+71,4 do
  line(14,scan_y,113,scan_y,1)
 end

 print(
  "system: "..system.name,
  18,
  y+13,
  7
 )

 print(
  "hold z to maintain",
  18,
  y+24,
  6
 )

 --tiny animated system mascot
 draw_system_animation(
  102,
  y+19,
  system.name
 )

 draw_large_system_bar(
  18,
  y+39,
  system.level
 )

 print(
  flr(system.level).."%",
  52,
  y+54,
  get_system_color(system)
 )

 print("ammo synth",18,y+64,6)
 draw_ammo_charge_bar(63,y+64,45)

 print(
  "x: lower visor",
  34,
  y+80,
  6
 )
end


--================================
-- visor system animations
--================================

function draw_system_animation(x,y,name)

 local frame=
  flr(ui_anim_timer/8)%4

 if name=="oxygen" then
  draw_oxygen_animation(x,y,frame)
 elseif name=="power" then
  draw_power_animation(x,y,frame)
 else
  draw_comms_animation(x,y,frame)
 end
end


function draw_oxygen_animation(x,y,frame)

 local sway=-1

 if frame>=2 then
  sway=1
 end

 --small flower pot
 rectfill(x-4,y+8,x+4,y+11,9)
 line(x-3,y+12,x+3,y+12,5)

 --dancing stem
 line(x,y+8,x+sway,y+2,11)
 line(x+sway,y+2,x,y,11)

 --leaves swap sides as it sways
 circfill(x-2*sway,y+5,1,3)
 circfill(x+2*sway,y+3,1,11)

 --tiny oxygen bubbles
 if frame%2==0 then
  pset(x+5,y+2,12)
  pset(x+7,y,6)
 else
  pset(x+6,y+1,12)
  pset(x+4,y-1,6)
 end
end


function draw_power_animation(x,y,frame)

 local cx=x
 local cy=y+6
 local angle=frame/4

 --hamster wheel
 circ(cx,cy,7,6)
 circ(cx,cy,6,5)
 pset(cx,cy,7)

 --rotating wheel spokes
 for i=0,3 do
  local a=angle+i/4

  line(
   cx,
   cy,
   cx+cos(a)*5,
   cy+sin(a)*5,
   6
  )
 end

 --tiny hamster running inside
 local hx=cx+cos(angle)*4
 local hy=cy+sin(angle)*4

 circfill(hx,hy,2,9)
 pset(hx+1,hy-1,10)
 pset(hx+2,hy,0)
end


function draw_comms_animation(x,y,frame)

 --little receiver base
 rectfill(x-2,y+8,x+2,y+11,5)
 line(x,y+8,x,y+4,6)

 --dish points upward
 line(x,y+4,x-4,y+1,6)
 line(x,y+4,x+4,y+1,6)
 line(x-4,y+1,x+4,y+1,7)

 --pulsing radio signal
 local pulse=frame%3

 if pulse>=0 then
  pset(x,y-1,10)
 end

 if pulse>=1 then
  pset(x-3,y-3,6)
  pset(x+3,y-3,6)
 end

 if pulse>=2 then
  pset(x-6,y-5,12)
  pset(x+6,y-5,12)
 end

 --blinking status light
 pset(x+4,y+10,frame%2==0 and 11 or 3)
end


--================================
-- hud
--================================

function draw_hud()

 if visor_up then
  return
 end

 local seconds=
  ceil((level_length-level_frames)/60)

 seconds=max(0,seconds)

 print(
  "level "..level,
  3,
  3,
  10
 )

 print(
  "time",
  3,
  12,
  6
 )

 local timer_text="00:"

 if seconds<10 then
  timer_text=timer_text.."0"
 end

 timer_text=
  timer_text..seconds

 local timer_color=7

 if seconds<=10 then
  timer_color=8
 end

 print(
  timer_text,
  28,
  12,
  timer_color
 )

 print(
  "x: visor",
  88,
  3,
  6
 )

 print("ammo",3,21,6)

 for i=1,max_shots do

  local col=5

  if i<=shots_left then
   col=10
  end

  if ammo_flash>0
  and i==shots_left then
   col=7
  end

  rectfill(
   30+((i-1)*6),
   22,
   34+((i-1)*6),
   25,
   col
  )
 end

 print("synth",3,30,6)
 draw_ammo_charge_bar(30,30,52)

 draw_system_list()
end

function draw_system_list()

 local start_y=83

 for i=1,active_systems do

  local system=systems[i]
  local y=start_y+((i-1)*8)
  local col=get_system_color(system)

  --selection arrow
  if i==selected_system then
   print(">",3,y,10)
  end

  --system name
  print(
   system.name,
   10,
   y,
   col
  )

  --system bar
  draw_small_system_bar(
   54,
   y,
   system.level
  )
 end
end


--================================
-- ammo fabricator bar
--================================

function draw_ammo_charge_bar(x,y,w)

 rect(x,y,x+w,y+5,5)

 local fill=
  flr((ammo_charge/ammo_charge_needed)*(w-2))

 fill=mid(0,fill,w-2)

 local col=10

 if shots_left>=max_shots then
  fill=w-2
  col=11
 end

 rectfill(
  x+1,
  y+1,
  x+1+fill,
  y+4,
  col
 )
end

--================================
-- bars
--================================

function draw_large_system_bar(x,y,value)

 rect(x,y,x+90,y+10,5)

 local width=
  flr(value*0.88)

 local col=
  get_level_color(value)

 rectfill(
  x+2,
  y+2,
  x+2+width,
  y+8,
  col
 )
end


function draw_small_system_bar(x,y,value)

 rect(x,y,x+68,y+5,5)

 local width=
  flr(value*0.65)

 rectfill(
  x+1,
  y+1,
  x+1+width,
  y+4,
  get_level_color(value)
 )
end

--================================
-- asteroids
--================================

function draw_asteroids()

 for asteroid in all(asteroids) do

  local x=asteroid.x
  local y=asteroid.y
  local s=asteroid.size

  --dark body
  circfill(x,y,s,5)

  --uneven rocky edges
  circfill(x-s/2,y-s/2,s/2,6)
  circfill(x+s/2,y,s/3,5)
  circfill(x-s/3,y+s/2,s/3,1)

  --craters
  if s>=4 then
   circfill(x-1,y-1,1,1)
   pset(x+2,y+1,6)
  end
 end
end


function draw_particles()

 for particle in all(particles) do

  local col=particle.col

  if particle.life<7 then
   col=5
  end

  --short moving shard trail
  line(
   particle.x,
   particle.y,
   particle.x-particle.dx*3,
   particle.y-particle.dy*3,
   col
  )

  pset(
   particle.x,
   particle.y,
   particle.life>12 and 7 or col
  )
 end
end

--================================
-- gun and crosshair
--================================

function draw_crosshair()

 if visor_up
 or game_state!="playing" then
  return
 end

 local x=mouse_x
 local y=mouse_y

 line(x-4,y,x-2,y,10)
 line(x+2,y,x+4,y,10)
 line(x,y-4,x,y-2,10)
 line(x,y+2,x,y+4,10)

 pset(x,y,7)
end


function draw_gun()

 if visor_up then
  return
 end

 --gun body
 rectfill(58,112,70,127,5)
 rectfill(61,105,67,116,6)

 --barrel
 rectfill(63,99,65,108,7)

 --laser flash
 if shot_flash>0 then

  line(
   64,
   102,
   shot_x,
   shot_y,
   10
  )

  line(
   65,
   102,
   shot_x,
   shot_y,
   7
  )
 end
end

--================================
-- distorted monster jumpscare
--================================

function draw_jumpscare()

 --hard camera shake makes the
 --face feel pressed into the glass
 local jx=flr(rnd(7))-3
 local jy=flr(rnd(7))-3

 --the mouth pulses open and shut
 local mouth_wave=
  (sin(jumpscare_timer/14)+1)/2

 local mouth_bottom=
  87+flr(mouth_wave*12)

 local splash_phase=
  flr(jumpscare_timer/3)%8

 cls(0)
 camera(jx,jy)

 --================================
 -- thorn-covered silhouette
 --================================

 --black head mass
 ovalfill(7,-10,121,108,0)
 circfill(17,38,31,0)
 circfill(111,36,32,0)

 --purple crown / horns
 line(39,21,31,-8,13)
 line(40,21,38,-9,2)
 line(49,18,45,-12,13)
 line(50,18,52,-10,2)

 line(78,18,77,-11,13)
 line(79,18,85,-9,2)
 line(88,22,99,-7,13)
 line(89,22,105,-4,2)

 --upper branching thorns
 line(36,28,22,15,13)
 line(22,15,15,4,2)
 line(22,15,9,18,13)
 line(18,11,12,7,2)

 line(92,27,108,13,13)
 line(108,13,116,1,2)
 line(108,13,124,17,13)
 line(115,9,121,6,2)

 --side tendrils
 line(24,46,5,34,13)
 line(14,41,-6,36,2)
 line(18,49,-8,55,13)
 line(12,54,4,66,2)

 line(104,45,123,32,13)
 line(114,40,137,35,2)
 line(109,51,137,59,13)
 line(118,57,126,70,2)

 --lower claw-like branches
 line(23,76,6,87,13)
 line(12,83,-4,79,2)
 line(17,88,4,102,13)
 line(8,96,-5,105,2)

 line(105,76,122,88,13)
 line(115,84,134,80,2)
 line(111,90,124,105,13)
 line(120,99,136,108,2)

 --small thorn offshoots
 line(30,31,23,26,2)
 line(26,35,17,34,13)
 line(98,31,105,25,2)
 line(102,36,112,34,13)
 line(27,68,16,65,2)
 line(101,68,113,64,2)

 --================================
 -- tiny beady staring eyes
 --================================

 --large empty sockets make the
 --tiny eyes feel trapped inside
 ovalfill(18,18,58,59,1)
 ovalfill(68,16,112,58,1)

 --infected rims
 ovalfill(29,30,47,48,13)
 ovalfill(81,27,99,45,13)
 ovalfill(31,32,45,46,2)
 ovalfill(83,29,97,43,2)

 --tiny eye whites
 ovalfill(34,35,42,43,7)
 ovalfill(86,32,94,40,7)

 --almost fully dilated pupils
 circfill(38,39,3,0)
 circfill(90,36,3,0)

 --single pinprick reflections
 pset(37,38,7)
 pset(89,35,7)

 --bloodshot splinters
 for i=0,9 do

  local a=i/10
  local r1=5
  local r2=10+(i%3)

  line(
   38+cos(a)*r1,
   39+sin(a)*r1,
   38+cos(a)*r2,
   39+sin(a)*r2,
   i%2==0 and 8 or 14)

  line(
   90+cos(a)*r1,
   36+sin(a)*r1,
   90+cos(a)*r2,
   36+sin(a)*r2,
   i%2==0 and 8 or 14)
 end

 --heavy crooked lids
 line(29,34,38,28,0)
 line(38,28,47,34,0)
 line(81,31,90,25,0)
 line(90,25,99,31,0)

 --thin bloody tears
 line(36,43,35,53,8)
 line(40,43,41,57,8)
 line(88,40,87,52,8)
 line(92,40,94,56,8)
 pset(35,54,14)
 pset(41,58,14)
 pset(87,53,14)
 pset(94,57,14)

 --================================
 -- narrow split nose
 --================================

 line(61,43,58,59,13)
 line(58,59,63,66,2)
 line(67,43,70,59,13)
 line(70,59,65,66,2)
 line(63,51,65,65,1)

 --================================
 -- giant animated mouth
 --================================

 --outer infected gums
 ovalfill(18,54,110,mouth_bottom+2,13)
 ovalfill(21,57,107,mouth_bottom,2)

 --blood-dark lip line
 line(24,58,102,58,8)

 --mouth void
 ovalfill(25,60,103,mouth_bottom-3,0)

 --upper teeth
 for i=0,11 do

  local tx=28+i*6
  local tooth_h=
   10+((i*7)%15)

  if i==3 or i==8 then
   tooth_h+=6
  end

  draw_fang_down(
   tx,58,5,tooth_h,7)
 end

 --lower teeth
 for i=0,10 do

  local tx=31+i*7
  local tooth_h=
   9+((i*5)%14)

  if i==1 or i==7 then
   tooth_h+=6
  end

  draw_fang_up(
   tx,mouth_bottom-3,
   5,tooth_h,7)
 end

 --deep purple tongue
 if mouth_wave>0.28 then

  ovalfill(
   49,
   mouth_bottom-23,
   79,
   mouth_bottom+5,
   2)

  ovalfill(
   55,
   mouth_bottom-17,
   73,
   mouth_bottom+4,
   13)

  line(
   64,mouth_bottom-18,
   64,mouth_bottom+3,2)
 end

 --blood at the gumline
 for i=0,8 do

  local bx=29+i*9
  local by=58+(i%3)

  line(
   bx,by,
   bx,by+4+(i%4),8)
 end

 --dripping gums
 for i=0,9 do

  local dx=27+i*8
  local drip=2+((i*5)%8)

  line(
   dx,mouth_bottom-5,
   dx,mouth_bottom+drip,
   i%2==0 and 8 or 14)
 end

 --animated blood sprays outward
 --from both sides of the mouth
 for i=0,5 do

  local sy=62+i*5
  local reach=
   8+((i*7+splash_phase*3)%20)
  local wobble=(i%3)-1

  line(
   23,sy,
   max(0,23-reach),
   sy+wobble-splash_phase/2,
   i%2==0 and 8 or 14)

  line(
   105,sy,
   min(127,105+reach),
   sy-wobble-splash_phase/2,
   i%2==0 and 8 or 14)

  circfill(
   max(0,21-reach),
   sy+wobble,
   i%3==0 and 2 or 1,
   8)

  circfill(
   min(127,107+reach),
   sy-wobble,
   i%3==0 and 2 or 1,
   8)
 end

 --small splashes around the jaw
 pset(18,mouth_bottom+4,8)
 pset(22,mouth_bottom+8,14)
 pset(109,mouth_bottom+5,8)
 pset(105,mouth_bottom+9,14)
 line(20,mouth_bottom,15,mouth_bottom+7,8)
 line(108,mouth_bottom,114,mouth_bottom+8,8)

 --================================
 -- warning text
 --================================

 camera()

 print("system failure",2,2,14)
 print("no signal",90,2,14)

 print("all systems down",32,106,7)
 print("you are not safe",32,115,14)

 --================================
 -- signal corruption
 --================================

 for i=1,9 do

  local gy=flr(rnd(104))
  local gx=flr(rnd(32))
  local gw=24+flr(rnd(74))

  rectfill(
   gx,gy,
   min(127,gx+gw),
   gy+flr(rnd(2)),
   rnd(1)<0.5 and 2 or 13)
 end

 --white signal tears
 for i=1,3 do

  local gy=flr(rnd(104))
  local gx=flr(rnd(84))

  rectfill(
   gx,gy,
   min(127,gx+18+rnd(35)),
   gy,7)
 end

 --flashing edge frame
 if jumpscare_timer%8<4 then
  rect(0,0,127,127,8)
 else
  rect(0,0,127,127,13)
 end
end

--================================
-- filled downward fang
--================================

function draw_fang_down(x,y,w,h,col)

 local half=flr(w/2)

 for py=0,h do

  local width=
   flr(half*(h-py)/h)

  line(
   x-width,
   y+py,
   x+width,
   y+py,
   col
  )
 end
end


--================================
-- filled upward fang
--================================

function draw_fang_up(x,y,w,h,col)

 local half=flr(w/2)

 for py=0,h do

  local width=
   flr(half*(h-py)/h)

  line(
   x-width,
   y-py,
   x+width,
   y-py,
   col
  )
 end
end
-->8
-- tab 4: screens / effects
--================================

function draw_warning_effect()

 if warning_timer<=0 then
  return
 end

 if warning_timer%4<2 then
  rect(0,0,127,127,8)
 end
end


function draw_level_transition()

 if transition_timer<=0 then
  return
 end

 rectfill(14,44,113,82,0)
 rect(14,44,113,82,10)

 print_center(
  "level "..level,
  53,
  10
 )

 if level>=4 then
  print_center(
   "asteroid pressure up",
   66,
   8
  )
 else
  print_center(
   "drain increasing",
   66,
   6
  )
 end
end


function draw_flash()

 if screen_flash>0 then

  if screen_flash%2==0 then
   rectfill(0,0,127,127,7)
  end
 end
end


function draw_lose_screen()

 rectfill(10,37,117,91,0)
 rect(10,37,117,91,8)

 print(
  "system failure",
  37,
  47,
  8
 )

 print(
  failed_system.." offline",
  38,
  61,
  6
 )

 print(
  "reached level "..level,
  31,
  73,
  7
 )

 print(
  "x to restart",
  42,
  83,
  6
 )
end

--================================
-- opticbox intro sequence
--================================

function draw_intro()

 cls(0)

 local t=intro_timer

 --opening darkness
 if t<40 then
  return
 end

 --production logo and soft glow
 if t<150 then

  local logo_col=5

  if t>=70 then
   logo_col=6
  end

  if t>=105 then
   logo_col=7
  end

  circ(64,59,18,1)
  circ(64,59,24,1)

  print_center(
   "0pticbox productions",
   57,
   logo_col
  )

  return
 end

 --space slowly appears
 for star in all(stars) do
  pset(star.x,star.y,star.col)
 end

 --planet horizon
 circfill(64,157,52,1)
 circfill(64,160,49,12)
 ovalfill(25,114,103,168,1)

 --faint scanline sweep
 local scan_y=
  24+((t*2)%70)

 line(14,scan_y,113,scan_y,1)

 --title screen
 if not intro_controls then

  --visor-like title brackets
  line(18,42,30,42,5)
  line(18,42,18,53,5)
  line(110,42,98,42,5)
  line(110,42,110,53,5)

  local title_col=6

  if t>=190 then
   title_col=7
  end

  print_center(
   "orbital repair",
   48,
   title_col
  )

  print_center(
   "maintenance link established",
   62,
   6
  )

  print_center(
   "three systems online",
   72,
   5
  )

  return
 end

 draw_controls_window()
end


function draw_controls_window()

 --open terminal window
 rectfill(7,15,120,116,0)
 rect(7,15,120,116,6)
 rect(10,18,117,113,1)

 print_center(
  "operator controls",
  23,
  10
 )

 line(15,32,112,32,5)

 print("mouse",16,39,6)
 print("aim",69,39,7)

 print("left click",16,49,6)
 print("fire",69,49,7)

 print("left/right",16,59,6)
 print("select",69,59,7)

 print("hold z",16,69,6)
 print("maintain",69,69,7)

 print("press x",16,79,6)
 print("visor",69,79,7)

 print_center(
  "keep all bars above 75%",
  91,
  5
 )

 print_center(
  "to synthesize ammo",
  99,
  5
 )

 if intro_timer>=320
 and intro_timer%60<45 then
  print_center(
   "press x to deploy",
   107,
   10
  )
 end
end


--================================
-- story cutscenes
--================================

function draw_cutscene()

 if cutscene_type==1 then
  draw_scene_float()
 elseif cutscene_type==2 then
  draw_scene_terminal()
 elseif cutscene_type==3 then
  draw_scene_watcher()
 else
  draw_scene_homecoming(cutscene_timer)
 end
end


--after level 4:
--the astronaut simply drifts
function draw_scene_float()

 cls(0)
 draw_space()

 local t=cutscene_timer
 local x=26+t*0.18
 local y=57+sin(t/48)*4

 draw_scene_astronaut(x,y,t,0)
end


--after level 8:
--the terminal stays just beyond
--the astronaut's fingertips
function draw_scene_terminal()

 cls(0)
 draw_space()

 local t=cutscene_timer
 local ax=7+t*0.22
 local ay=61+sin(t/38)*3
 local tx=38+t*0.29
 local ty=56+sin(t/29)*5

 draw_scene_astronaut(ax,ay,t,1)
 draw_scene_terminal_box(tx,ty,t)
end


--after level 12:
--the astronaut senses something
--quietly floating behind them
function draw_scene_watcher()

 cls(0)
 draw_space()

 local t=cutscene_timer
 local ax=68+sin(t/55)*3
 local ay=62+sin(t/37)*2

 draw_scene_astronaut(ax,ay,t,2)

 if t>55 then

  local mx=-12+(t-55)*0.18
  mx=min(43,mx)

  draw_scene_shadow(mx,ay,t)
 end

 if t>80 then
  local qy=ay-24+sin(t/20)*2
  print("?",ax+8,qy,10)
 end
end


--after level 20:
--the ship returns to a bright,
--hopeful city on earth
function draw_scene_homecoming(t)

 draw_utopian_city(t)

 local ship_y=-20+min(1,t/300)*91

 if t>300 then
  ship_y=71+sin(t/28)
 end

 draw_landing_ship(64,ship_y,t)

 if t>270 then
  draw_cheering_crowd(t)
 end

 if t>350 then
  print_center("welcome home",18,7)
 end
end


function draw_scene_astronaut(x,y,t,pose)

 --backpack
 rectfill(x-7,y-5,x-3,y+5,5)

 --helmet and dark visor
 circfill(x,y-7,6,6)
 circfill(x+1,y-7,4,1)
 line(x-2,y-10,x+3,y-10,7)

 --body
 rectfill(x-4,y-1,x+4,y+8,6)
 rect(x-4,y-1,x+4,y+8,7)

 local arm=sin(t/18)*2

 if pose==1 then
  --reach toward the escaping terminal
  line(x+4,y+1,x+13,y-3,6)
  line(x+13,y-3,x+17,y-2,7)
  line(x-4,y+1,x-8,y+4+arm,6)
 elseif pose==2 then
  --slightly confused floating pose
  line(x-4,y+1,x-9,y-3+arm,6)
  line(x+4,y+1,x+8,y-3-arm,6)
 else
  --calm weightless drift
  line(x-4,y+1,x-9,y-1+arm,6)
  line(x+4,y+1,x+9,y+3-arm,6)
 end

 --legs
 line(x-2,y+8,x-5,y+14,6)
 line(x+2,y+8,x+6,y+13,6)
end


function draw_scene_terminal_box(x,y,t)

 local wobble=flr(t/16)%2

 rectfill(x-6,y-5,x+6,y+5,5)
 rect(x-6,y-5,x+6,y+5,7)
 rectfill(x-4,y-3,x+4,y+2,1)
 pset(x-2+wobble,y-1,11)
 pset(x+2-wobble,y,10)
 line(x+5,y-4,x+8,y-8,6)
 pset(x+8,y-8,10)
end


function draw_scene_shadow(x,y,t)

 local open=flr(t/18)%2==0

 --thin, uneven silhouette
 ovalfill(x-7,y-12,x+7,y+12,1)
 oval(x-7,y-12,x+7,y+12,2)
 circfill(x-5,y-5,5,0)
 circfill(x+5,y-3,4,0)

 --crooked horns
 line(x-4,y-9,x-8,y-16,2)
 line(x+4,y-9,x+8,y-15,2)

 --tiny fixed eyes
 pset(x-2,y-5,7)
 pset(x+3,y-5,7)

 if open then
  rectfill(x-2,y,x+3,y+3,2)
 else
  line(x-3,y+1,x+4,y+2,2)
 end

 line(x-5,y+8,x-10,y+15,2)
 line(x+4,y+8,x+10,y+14,2)
end


function draw_utopian_city(t)

 cls(12)

 --clean layered sky
 rectfill(0,0,127,20,1)
 rectfill(0,21,127,42,13)
 rectfill(0,43,127,78,12)

 --sun and distant clouds
 circfill(105,17,10,10)
 circfill(17,27,8,6)
 circfill(25,26,10,6)
 circfill(34,28,7,6)

 --bright city skyline
 rectfill(0,75,127,127,11)
 rectfill(0,85,127,127,3)

 rectfill(7,53,21,84,6)
 rectfill(10,49,18,84,7)
 rectfill(28,61,42,84,6)
 rectfill(31,56,39,84,7)
 rectfill(86,57,101,84,6)
 rectfill(89,51,98,84,7)
 rectfill(107,63,120,84,6)

 --glass domes and windows
 circfill(63,69,18,6)
 circfill(63,70,15,12)
 line(48,70,78,70,7)
 line(63,54,63,84,7)

 for wx=10,116,9 do
  pset(wx,70-(wx%3)*3,10)
 end

 --landing platform
 rectfill(43,82,85,87,5)
 rectfill(49,79,79,82,6)
 line(43,87,85,87,7)
end


function draw_landing_ship(x,y,t)

 --soft engine glow while descending
 if t<310 then
  line(x-5,y+12,x-8-rnd(3),y+20,10)
  line(x,y+12,x+rnd(3)-1,y+22,7)
  line(x+5,y+12,x+8+rnd(3),y+20,10)
 end

 --main hull
 ovalfill(x-13,y-7,x+13,y+10,6)
 oval(x-13,y-7,x+13,y+10,7)
 rectfill(x-7,y-12,x+7,y-5,6)
 ovalfill(x-6,y-15,x+6,y-6,12)

 --side fins and landing legs
 line(x-11,y+5,x-18,y+11,5)
 line(x+11,y+5,x+18,y+11,5)
 line(x-7,y+9,x-10,y+15,5)
 line(x+7,y+9,x+10,y+15,5)
end


function draw_cheering_crowd(t)

 for i=0,10 do

  local x=7+i*11
  local y=99+(i%2)*4
  local wave=sin(t/10+i/7)*3
  local col=6+(i%2)

  circfill(x,y-5,2,col)
  line(x,y-3,x,y+4,col)
  line(x,y+4,x-2,y+8,col)
  line(x,y+4,x+2,y+8,col)
  line(x,y-1,x-4,y-6+wave,col)
  line(x,y-1,x+4,y-6-wave,col)
 end
end


function draw_final_screen()

 draw_utopian_city(480)
 draw_landing_ship(64,71,480)
 draw_cheering_crowd(ui_anim_timer)

 rectfill(22,8,105,31,0)
 rect(22,8,105,31,10)
 print_center("mission complete",13,10)
 print_center("press x to restart",23,7)
end

--================================
-- ammo reward notice
--================================

function draw_ammo_notice()

 if ammo_message_timer<=0 then
  return
 end

 rectfill(29,38,99,51,0)
 rect(29,38,99,51,10)

 print_center(
  "round fabricated",
  43,
  10
 )
end

-->8
--utilities
--================================

function get_system_color(system)
 return get_level_color(system.level)
end


function get_level_color(value)

 if value>60 then
  return 11
 elseif value>30 then
  return 10
 else
  return 8
 end
end


function print_center(text,y,col)

 local x=
  64-(#text*2)

 print(text,x,y,col)
end

__gfx__
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00700700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00077000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00077000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00700700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
__sfx__
001b0000321502913001000000000a0000400000000050000000006000080000a0000b0000d0000e00010000110001300015000170001a0001c0001e000200002200024000270002a0002d00030000350003a000
0010000014550195501a550095500d55012550165501655012550105500f5500c5500000008550035500000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000003965009650006000060000600006002460026600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
161000003f2770020000200037000070000700387003d700000003670000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000003f6503f6503e6503f6503e6503e6500a6503c600156000b600036000b6003860004600006003660035600336000000000000000000000000000000000000000000000000000000000000000000000000
16100000027720067200272022720120201202022020030200302003020e002200021900208002000023e0020000000000000003e000000003e0003e000000000000000000000000000000000000000000000000
001000001315014140071200611005100031000310001100001000110001100001000110000100001000110001100011000210000100001000410000100011000110000100001000110004100001000210001100
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000300003f6733a6723d67334672376732f67232673296722c67322672266731c6721f673166721967310672136730b6720e673076720a2730467301273006750000000000000000000000000000000000000000
000200002a67312673052730067000265006550024500635000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000e5240e5200e5200e5200e5300e5200e5200e52509524095200952009520095300952009520095250c5240c5200c5200c5200c5300c5200c5200c5250e5240e5200e5200e5200e5300e5200e5200e525
001000000000000000000000000026734000000000000000000000000000000000002172200000000000000000000000000000000000247340000000000000000000000000000000000027725000000000000000
001000000c5240c5200c5200c5200c5300c5200c5200c52509524095200952009520095300952009520095250a5240a5200a5200a5200a5300a5200a5200a5250d5240d5200d5200d5200d5300d5200d5200d525
001000000000000000297240000000000000000000000000000000000028732000000000000000000000000000000000002572500000000000000000000000000000000000267340000000000000000000000000
001000000a5240a5200a5200a5200a5300a5200a5200a52509524095200952009520095300952009520095250c5240c5200c5200c5200c5300c5200c5200c5250e5240e5200e5200e5200e5300e5200e5200e525
001000000000000000000000000000000227340000000000000000000000000000000000025722000000000000000000000000000000000002873400000000000000000000000000000000000297250000000000
001000000e5240e5200e5200e5200e5300e5250d5240d5200d5200d5200d5200d5250e5340e5200e5200e5200e5200e5250c5240c5200c5300c5200c5200c5250952409520095200952009530095200952009525
001000000000000000000002673400000000000000000000000002972200000000000000000000000002773000000000000000000000000002572200000000000000000000000002674500000000000000000000
000800000e4300e4200e4200e4200d4300d4200d4200d4230e4300e4200e4200e4200d4300d4200d4200d4230e4300e4200e4200e4200d4300d4200d4200d4230e4300e4200e4200e4200d4300d4200d4200d423
00080000267420000029730000002773200000257300c623267420000029730000002773200000257300a623267420000029730000002773200000257300d623267420000029730000002773200000257300b623
000800000c4300c4200c4200c4200a4300a4200a4200a4230c4300c4200c4200c4200a4300a4200a4200a4230c4300c4200c4200c4200a4300a4200a4200a4230c4300c4200c4200c4200a4300a4200a4200a423
0008000029742000002873000000257320a623267300000029742000002873000000257320d623267300000029742000002873000000257320b623267300000029742000002873000000257320e6232673000000
000800000a4300a4200a4200a420094300942009420094230a4300a4200a4200a420094300942009420094230a4300a4200a4200a420094300942009420094230a4300a4200a4200a42009430094200942009423
000800002274200000257300d623287320000029730000002274200000257300b623287320000029730000002274200000257300e623287320000029730000002274200000257300c62328732000002973000000
000800000e4300e4200e4200e420094300942009420094230e4300e4200e4200e420094300942009420094230e4300e4200e4200e420094300942009420094230e4300e4200e4200e42009430094200942009423
00080000267420b623277300000025732000002973000000287420e623267300000027732000002573000000297420c623287300000026732000002773000000257420a623297300000028732000002673000000
__music__
00 01424344
01 41420c0d
00 41420e0f
00 41421011
02 41421213
01 41421415
00 41421617
00 41421819
02 41421a1b

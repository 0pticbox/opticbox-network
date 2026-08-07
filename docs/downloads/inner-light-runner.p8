pico-8 cartridge // http://www.pico-8.com
version 41
__lua__
function _init()

 if not save_data_loaded then
  cartdata("optic_forest_speedruns")
  save_data_loaded=true
 end

 game_state="splash"
 splash_timer=0

 enemies={}
 lasers={}
 coins={}
 particles={}
 spikes={}
 fires={}
 flowers={}
 water={}
 water2={}
 water3={}
 water4={}
 signs={}
sign_message=nil

music(0)

	
	
 player={
  sp=1,
  x=59,
  y=59,
  w=8,
  h=8,
  flp=false,
  dx=0,
  dy=0,
  max_dx=2,
  max_dy=3,
  acc=0.5,
  boost=4,
  anim=0,
  running=false,
  jumping=false,
  falling=false,
  sliding=false,
  landed=false,
  attacking=false,
  attack_timer=0
 }
 
 
cam_x=0
cam_y=0

 gravity=0.3
 friction=0.85

 spawn_x=59
 spawn_y=59

 map_start=0
 map_end=1000

 spawn_level_enemies()
 spawn_level_coins()
 spawn_level_spikes()
 spawn_level_fires()
 spawn_level_flower()
 spawn_level_water()
 spawn_level_signs()
 
 
	sign_message=nil
 total_coins=#coins

 win=false
 game_over=false
 coins_collected=0
 lives=3
 timer_init()

end

--========================
-- stopwatch
--========================
run_start=0
run_time=0
timer_running=false
time_saved=false
best_times={}
save_data_loaded=false
win_page=1

--========================
-- stopwatch
--========================

run_start=0
run_time=0
timer_running=false
time_saved=false
best_times={}
save_data_loaded=false


function timer_init()

 if best_times==nil then

  best_times={
   9999,
   9999,
   9999,
   9999,
   9999
  }

 end

 start_timer()

end

function start_timer()

 run_start=time()
 run_time=0
 timer_running=true
 time_saved=false

end
-->8
function _update()

 if game_state=="splash" then
  splash_timer+=1

  if splash_timer>150 or btnp(❎) then
   game_state="menu"
  end

  return
 end

 if game_state=="menu" then

  if btnp(❎) then
   start_timer()
   game_state="play"
  end

  return
 end

if win then

 if btnp(❎) then
  if win_page==1 then
   win_page=2
  else
   reload()
   _init()
   game_state="play"
  end
 end

 return
end
if game_over then

 if btnp(❎) then
  reload()
  _init()
  game_state="play"
 end

 return
end

 player_update()
 player_animate()
 particle_update()

 enemy_update()
 laser_update()

 coin_update()
 spike_update()
 fire_update()
 flowers_update()

 water_update()
 water2_update()
 water3_update()
 water4_update()

 sign_update()
 timer_update()

 --camera
 cam_x=player.x-64+player.w/2
 cam_y=player.y-64+player.h/2

 if cam_x<map_start then
  cam_x=map_start
 end

 if cam_x>map_end-128 then
  cam_x=map_end-128
 end

 camera(cam_x,cam_y)

end

--========================
-- enemy shoot(e)
--========================
function shoot(e)

 local speed=2

 if player.x<e.x then
  speed=-2
 else
  speed=2
 end
 
 if player.x<e.x then
 e.flp=true
else
 e.flp=false
end

 add(lasers,{
  x=e.x+4,
  y=e.y+4,
  dx=speed,
  spr=20
 })

end
--========================
-- enemy upate
--========================

function enemy_update()

 for e in all(enemies) do

  --distance to player
  local dist=abs(player.x-e.x)

  --only shoot if player is close
  if dist<160 then

   e.timer+=1

   if e.timer>30 then
    shoot(e)
    e.timer=0
    
   end

  else
   --reset timer while player is far away
   e.timer=0
  end

 end

end

--========================
-- laser upate
--========================

function laser_update()


 for l in all(lasers) do

  l.x += l.dx

  -- hit player
  if abs(player.x-l.x)<8
and abs(player.y-l.y)<8 then

 hurt_player()
 del(lasers,l)

end

  -- remove offscreen
  if l.x<0 or l.x>map_end then
   del(lasers,l)
  end

 end

end

--========================
-- sign update
--========================

function sign_update()

 --close message with ❎
 if sign_message then

  if btnp(❎) then
   sign_message=nil
  end

  return
 end

 for s in all(signs) do

  local close_x=abs(player.x-s.x)<12
  local close_y=abs(player.y-s.y)<12

  if close_x and close_y
  and btnp(❎) then
   sign_message=s.message
  end

 end

end
--========================
-- water animation and update
--========================

function add_water(x,y)

 add(water,{
  x=x,
  y=y,
  spr=24,
  timer=0
 })

end


function add_water2(x,y)

 add(water2,{
  x=x,
  y=y,
  spr=21,
  timer=0
 })

end


function add_water3(x,y)

 add(water3,{
  x=x,
  y=y,
  spr=38,
  timer=0
 })

end


function add_water4(x,y)

 add(water4,{
  x=x,
  y=y,
  spr=54,
  timer=0
 })

end
function water_update()

 for w in all(water) do
  w.timer+=1

  if w.timer>8 then
   w.timer=0
   w.spr+=1

   if w.spr>27 then
    w.spr=24
   end
  end
 end

end


function water2_update()

 for w in all(water2) do
  w.timer+=1

  if w.timer>8 then
   w.timer=0
   w.spr+=1

   if w.spr>23 then
    w.spr=21
   end
  end
 end

end


function water3_update()

 for w in all(water3) do
  w.timer+=1

  if w.timer>8 then
   w.timer=0
   w.spr+=1

   if w.spr>40 then
    w.spr=38
   end
  end
 end

end


function water4_update()

 for w in all(water4) do
  w.timer+=1

  if w.timer>8 then
   w.timer=0
   w.spr+=1

   if w.spr>56 then
    w.spr=54
   end
  end
 end

end
--========================
-- coins
--========================

function coin_update()

 for c in all(coins) do

  --animation
  c.timer+=1

  if c.timer>10 then
   c.timer=0

   if c.spr==10 then
    c.spr=11
   else
    c.spr=10
   end
  end

  --collection
  if abs(player.x-c.x)<8
  and abs(player.y-c.y)<8 then

   coins_collected+=1
   sfx(61)
   del(coins,c)

  end

 end

 --only win if the level originally had coins
 if #coins==0
 and total_coins>0 then
  stop_timer()
  save_run_time()
  win_page=1
  win=true
 end

end
--========================
-- fire animation/update
--========================

function fire_update()

 for f in all(fires) do

  f.timer+=1

  if f.timer>6 then

   f.timer=0

   if f.spr==48 then
    f.spr=49
   else
    f.spr=48
   end

  end

 end

end

--========================
-- flower animation/update
--========================

function flowers_update()

 for p in all(flowers) do

  p.timer+=1

  if p.timer>6 then

   p.timer=0

   if p.spr==33 then
    p.spr=34
   else
    p.spr=33
   end

  end

 end

end




--========================
-- spikes
--========================

function spike_update()

 for s in all(spikes) do

  if abs(player.x-s.x)<8
  and abs(player.y-s.y)<8 then

   hurt_player()
   break

  end

 end

end

function particle_update()

 --check both bottom corners of player
 local left_tile=mget(
  flr((player.x+1)/8),
  flr((player.y+8)/8)
 )

 local right_tile=mget(
  flr((player.x+6)/8),
  flr((player.y+8)/8)
 )

 local touching_water=
  left_tile==35
  or left_tile==36
  or right_tile==35
  or right_tile==36

 --splash while walking on water
 if touching_water
 and abs(player.dx)>0.2
 and rnd(1)<0.4 then

  spawn_water_splash()

 end

 --update particles
 for p in all(particles) do

  p.x+=p.dx
  p.y+=p.dy

  p.dy+=0.12
  p.life-=1

  if p.life<=0 then
   del(particles,p)
  end

 end

end

function start_timer()

 run_start=time()
 run_time=0
 timer_running=true
 time_saved=false

end


function timer_update()

 if timer_running then
  run_time=time()-run_start
 end

end


function stop_timer()

 if timer_running then
  run_time=time()-run_start
  timer_running=false
 end

end

function save_run_time()

 if time_saved then
  return
 end

 time_saved=true

 add(best_times,run_time)

 for i=1,#best_times do
  for j=i+1,#best_times do

   if best_times[j]<best_times[i] then

    local temp=best_times[i]
    best_times[i]=best_times[j]
    best_times[j]=temp

   end

  end
 end

 while #best_times>5 do
  deli(best_times,#best_times)
 end

end
-->8
--spawn/variables/functions


enemies={}
lasers={}
coins={}
spikes={}
fires={}
flowers={}
water={}
water2={}
water3={}
water4={}
hurt_player={}



function add_water(x,y)

 add(water,{
  x=x,
  y=y,
  spr=24,
  timer=0
 })

end


function add_water2(x,y)

 add(water2,{
  x=x,
  y=y,
  spr=21,
  timer=0
 })

end

function add_water3(x,y)

 add(water3,{
  x=x,
  y=y,
  spr=38,
  timer=0
 })

end

function add_water4(x,y)

 add(water4,{
  x=x,
  y=y,
  spr=54,
  timer=0
 })

end


function add_fire(x,y)

 add(fires,{
  x=x,
  y=y,
  spr=48,
  timer=0
 })

end


function add_coin(x,y)

 add(coins,{
  x=x,
  y=y,
  spr=10,
  anim=0,
  timer=0
 })

end


function add_spike(x,y)

 add(spikes,{
  x=x,
  y=y,
  w=8,
  h=8,
  spr=32
 })

end

function add_flowers(x,y)

 add(flowers,{
  x=x,
  y=y,
  spr=33,
  timer=0
 })

end

--========================
-- player damage
--========================

function hurt_player()

 lives-=1
 sfx(60) --optional hurt sound

 player.x=spawn_x
 player.y=spawn_y
 player.dx=0
 player.dy=0

 --remove existing lasers
 lasers={}

 if lives<=0 then
  game_over=true
 end

end

--========================
-- MAP OBJECT SPAWNING
--========================

function add_sign(x,y,message)

 add(signs,{
  x=x,
  y=y,
  spr=60,
  message=message
 })

end

function spawn_level_signs()

 for y=0,63 do
  for x=0,127 do

   local tile=mget(x,y)

   if tile==47 then

    add(signs,{
     x=x*8,
     y=y*8,
     spr=47,
     message="welcome to the forest.\nlocate your light remanent \nand avoid the ai buzzers!"
    })

    mset(x,y,0)

   elseif tile==63 then

    add(signs,{
     x=x*8,
     y=y*8,
     spr=63,
     message="welcome to the hideout.\nenojy the visuals."
    })

    mset(x,y,0)

   end

  end
 end

end
function spawn_level_coins()

 for x=0,127 do
  for y=0,63 do

   if mget(x,y)==10 then

    add_coin(x*8,y*8)
    mset(x,y,0)

   end

  end
 end

end



function spawn_level_fires()

 for x=0,127 do
  for y=0,63 do

   if mget(x,y)==48 then

    add_fire(x*8,y*8)
    mset(x,y,0)

   end

  end
 end

end

function spawn_level_flower()

 for x=0,127 do
  for y=0,63 do

   if mget(x,y)==33 then
    add_flowers(x*8,y*8)
    mset(x,y,33)
   end

  end
 end

end

function spawn_level_water()

 for x=0,127 do
  for y=0,63 do

   local tile=mget(x,y)

   if tile==24 then
    add_water(x*8,y*8)
    mset(x,y,0)

   elseif tile==21 then
    add_water2(x*8,y*8)
    mset(x,y,0)

   elseif tile==38 then
    add_water3(x*8,y*8)
    mset(x,y,0)

   elseif tile==54 then
    add_water4(x*8,y*8)
    mset(x,y,0)
   end

  end
 end

end
function spawn_level_spikes()

 for x=0,127 do
  for y=0,63 do

   if mget(x,y)==32 then

    add_spike(x*8,y*8)
    mset(x,y,0)

   end

  end
 end

end
function spawn_level_enemies()

 for x=0,127 do
  for y=0,63 do
   if mget(x,y)==16 then
    spawn_enemy(x*8,y*8)
    mset(x,y,0)
   end
  end
 end

end

--========================
-- ENEMY
--========================

function spawn_enemy(x,y)

 add(enemies,{
  x=x,
  y=y,
  w=8,
  h=8,
  dx=.4,
  dy=0,
  flp=false,
  hp=2,
  state="walk",
  timer=0,
  spr=16,
  anim=0,
  anim_timer=0
 })

end

--========================
-- water splash particles
--========================

function spawn_water_splash()

 for i=1,3 do

  add(particles,{
   x=player.x+4+rnd(6)-3,
   y=player.y+7,
   dx=rnd(1.5)-0.75,
   dy=-rnd(1.5)-0.5,
   life=8+rnd(8),
   col=12
  })

 end

end
-->8
-- player
--========================


function player_update()

 --physics
 player.dy+=gravity
 player.dx*=friction


 --controls
 if btn(⬅️) then

  player.dx-=player.acc
  player.running=true
  player.flp=true

 elseif btn(➡️) then

  player.dx+=player.acc
  player.running=true
  player.flp=false

 end


 --slide
 if player.running
 and not btn(⬅️)
 and not btn(➡️)
 and not player.falling
 and not player.jumping then

  player.running=false
  player.sliding=true

 else

  player.sliding=false

 end



 --jump
 if btnp(❎) and player.landed then

  player.dy-=player.boost
  player.landed=false
  sfx(63)

 end
 



 --vertical collision
 if player.dy>0 then

  player.falling=true
  player.landed=false
  player.jumping=false


  if collide_map(player,"down",0) then

   player.landed=true
   player.falling=false
   player.dy=0
   player.y=flr(player.y/8)*8

  end


 elseif player.dy<0 then

  player.jumping=true


  if collide_map(player,"up",1) then
   player.dy=0
  end

 end



 --horizontal collision
 if player.dx<0 then

  if collide_map(player,"left",1) then
   player.dx=0
  end


 elseif player.dx>0 then

  if collide_map(player,"right",1) then
   player.dx=0
  end

 end



 --stop sliding
 if player.sliding
 and abs(player.dx)<0.2 then

  player.dx=0
  player.sliding=false

 end



 --movement
 player.x+=player.dx
 player.y+=player.dy



 --map limits
 if player.x<map_start then
  player.x=map_start
 end


 if player.x>map_end-player.w then
  player.x=map_end-player.w
 end




 --attack
 if btnp(5) then

  player.attacking=true
  player.attack_timer=6

 end



 if player.attacking then

  player.attack_timer-=1


  if player.attack_timer<=0 then
   player.attacking=false
  end



  local hitx


  if player.flp then
   hitx=player.x-8
  else
   hitx=player.x+8
  end



  for e in all(enemies) do


   if abs(hitx-e.x)<8
   and abs(player.y-e.y)<8 then


    e.hp-=1


    if e.hp<=0 then

     del(enemies,e)
     break

    end

   end


  end


 end

end




function player_animate()


 if player.jumping then

  player.sp=7


 elseif player.falling then

  player.sp=8


 elseif player.sliding then

  player.sp=9


 elseif player.running then


  if time()-player.anim>0.1 then

   player.anim=time()
   player.sp+=1


   if player.sp>6 then
    player.sp=3
   end

  end



 else


  if time()-player.anim>0.3 then

   player.anim=time()
   player.sp+=1


   if player.sp>2 then
    player.sp=1
   end

  end


 end


end
-->8
-- draw
 --========================

function _draw()

 if game_state=="splash" then
  draw_splash()
  return
 end

 if game_state=="menu" then
  draw_main_menu()
  return
 end

 if win then
  draw_win()
  return
 end

 if game_over then
  draw_game_over()
  return
 end

 cls(0)
 --========================
 -- background trees
 --========================

 camera(cam_x*0.3,cam_y*0.2)

 for y=-64,512,16 do
  for x=-64,2048,16 do
   spr(43,x,y,2,2)
  end
 end

 camera(cam_x*0.2,cam_y*0.1)

 for y=-64,512,16 do
  for x=-64,2048,16 do
   spr(44,x,y-8)
   spr(60,x,y)
  end
 end

 --main game camera
 camera(cam_x,cam_y)

 map()
 
 draw_particles()

 draw_coins()
 draw_spikes()
 draw_fires()
 draw_flowers()
 draw_enemies()

 draw_water()
 draw_water2()
 draw_water3()
 draw_water4()

 draw_lasers()
 draw_signs()

 spr(
  player.sp,
  player.x,
  player.y,
  1,
  1,
  player.flp
 )
 
	draw_vignette()
	
 --screen hud
 camera()
spr(10,5,4)

print(
 coins_collected.."/"..total_coins,
 15,
 5,
 7
)

print("lives:"..lives,88,5,7)

 draw_timer()
 draw_sign_message()

end


function draw_win()

 camera()
 cls(0)

 if win_page==1 then
  draw_win_story()
 else
  draw_leaderboard()
 end

end

--========================
-- vignette
--========================

function draw_vignette()

camera()

 fillp(▒)

 rectfill(0,0,127,5,0)
 rectfill(0,122,127,127,0)
 rectfill(0,0,5,127,0)
 rectfill(122,0,127,127,0)

 fillp()

end
--========================
-- draw water
--========================

function draw_water()

 for w in all(water) do
  spr(w.spr,w.x,w.y)
 end

end


function draw_water2()

 for w in all(water2) do
  spr(w.spr,w.x,w.y)
 end

end


function draw_water3()

 for w in all(water3) do
  spr(w.spr,w.x,w.y)
 end

end


function draw_water4()

 for w in all(water4) do
  spr(w.spr,w.x,w.y)
 end

end


--========================
-- draw lanterns
--========================

function draw_coins()

 for c in all(coins) do

  spr(
   c.spr,
   c.x,
   c.y
  )

 end

end


--========================
-- draw signs
--========================

function draw_signs()

 for s in all(signs) do

  spr(s.spr,s.x,s.y)

  if abs(player.x-s.x)<12
  and abs(player.y-s.y)<12
  and not sign_message then

   print("press 'x'",s.x-10,s.y-7,7)

  end

 end

end
function draw_sign_message()

 if not sign_message then
  return
 end

 --screen camera
 camera()

 rectfill(
  5,
  88,
  122,
  122,
  0
 )

 rect(
  5,
  88,
  122,
  122,
  7
 )

 print(
  sign_message,
  10,
  94,
  7
 )

 print(
  "press ❎ to close",
  35,
  114,
  6
 )

end

--========================
-- draw particals
--========================

function draw_particles()

 for p in all(particles) do

  if p.life>6 then
   circfill(p.x,p.y,1,p.col)
  else
   pset(p.x,p.y,p.col)
  end

 end

end
--========================
-- draw spikes
--========================

function draw_spikes()

 for s in all(spikes) do

  spr(
   s.spr,
   s.x,
   s.y
  )

 end

end


--========================
-- draw fire
--========================

function draw_fires()

 for f in all(fires) do

  spr(
   f.spr,
   f.x,
   f.y
  )

 end

end

--========================
-- draw flwoer
--========================

function draw_flowers()

 for p in all(flowers) do

  spr(
   p.spr,
   p.x,
   p.y
  )

 end

end


--========================
-- draw enemies
--========================

function draw_enemies()

 for e in all(enemies) do

  spr(
   e.spr,
   e.x,
   e.y,
   1,
   1,
   e.flp
  )

 end

end


--========================
-- draw lasers
--========================

function draw_lasers()

 for l in all(lasers) do

  spr(
   l.spr,
   l.x,
   l.y
  )

 end

end

--========================
-- main menu
--========================

--========================
-- opticbox productions splash
--========================
function draw_splash()

 camera()
 cls(0)

 --small light particles
 for i=1,12 do
  local x=(i*23+splash_timer) % 128
  local y=(i*37) % 128
  pset(x,y,5)
 end

 --logo reveal
 if splash_timer>20 then
  print("0PTICBOX",48,48,7)
 end

 if splash_timer>45 then
  line(27,59,100,59,10)
  print("productions",42,65,10)
 end

 if splash_timer>90 then
  print("presents",47,87,6)
 end

 --brief white flash before title
 if splash_timer>140 then
  fillp(▒)
  rectfill(0,0,127,127,7)
  fillp()
 end

end

function draw_main_menu()

 camera()

 cls(0)

 print("inner light",42,35,7)

 spr(10,60,52)

 print("press ❎ to start",31,75,6)

end

--========================
-- draw win screen
--========================

function draw_win()

 camera()
 cls(0)

 if win_page==1 then
  draw_win_story()
 else
  draw_leaderboard()
 end

end

--========================
-- draw game over screen
--========================

function draw_game_over()

 camera()
 cls(0)

 print("the darkness returns",24,45,8)
 print("all lives lost",38,62,7)
 print("press ❎ to try again",22,88,6)

end



function draw_timer()

 camera()

 rectfill(1,117,50,127,0)
print(format_time(run_time),3,119,7)

end

function pad_number(n)

 n=flr(n)

 if n<10 then
  return "0"..n
 end

 return n

end


function format_time(seconds)

 local minutes=flr(seconds/60)
 local whole_seconds=flr(seconds)%60
 local hundredths=flr(seconds*100)%100

 return minutes..
 ":"..
 pad_number(whole_seconds)..
 "."..
 pad_number(hundredths)

end
-->8
-- collision
--========================

function collide_map(obj,aim,flag)

 local x=obj.x
 local y=obj.y
 local w=obj.w
 local h=obj.h

 local x1
 local y1
 local x2
 local y2

 if aim=="left" then

  x1=flr((x-1)/8)
  y1=flr(y/8)
  x2=x1
  y2=flr((y+h-1)/8)

 elseif aim=="right" then

  x1=flr((x+w)/8)
  y1=flr(y/8)
  x2=x1
  y2=flr((y+h-1)/8)

 elseif aim=="up" then

  x1=flr(x/8)
  y1=flr((y-1)/8)
  x2=flr((x+w-1)/8)
  y2=y1

 elseif aim=="down" then

  x1=flr(x/8)
  y1=flr((y+h)/8)
  x2=flr((x+w-1)/8)
  y2=y1

 end

 if fget(mget(x1,y1),flag)
 or fget(mget(x1,y2),flag)
 or fget(mget(x2,y1),flag)
 or fget(mget(x2,y2),flag) then
  return true
 end

 return false

end

--========================
-- win story page
--========================
function draw_win_story()

 print("inner light restored",28,28,10)
 print("every lantern has been lit",12,52,7)
 print("the darkness fades away...",14,72,11)
 print("your time: "..format_time(run_time),24,92,7)
 print("press ❎ for best times",18,116,6)

end

--========================
-- leaderboard page
--========================
function draw_leaderboard()

 print("best times",44,10,10)

 for i=1,5 do
  local score=best_times[i]
  local y=24+(i-1)*15

  if score and score<9999 then
   print(i..". "..format_time(score),38,y,7)
  else
   print(i..". --:--.--",38,y,5)
  end
 end

 print("your run: "..format_time(run_time),27,104,11)
 print("press ❎ to run again",20,118,6)

end

__gfx__
00000000004444440044444400444444004444440044444400444444004444444044444400000000aaa99aaa999aa9996b333666bbbbbbbbb33bbb66bbbbbbbb
00000000004f7c7c044f7c7c004fff7c004fff7c004fff7c004fff7c004fff7c444fff7c04444440a99aa99a9aa99aa96b333336b33bbbbb336b3766bbbb6bbb
00700700444f7c7c044f7c7c004fff7c444fff7c404fff7c044fff7c044fff7c444fff7c44f7c7c0a9a79a9a9a9a79a9bbbbbbbbb333b33b36bb33376bbb6b6b
000770000448ffff4448ffff0448fffe0048fffe0448fffe0048fffe0448fffe4448fffe44f7c7c0a9a77a9a9a9779a900b0b0b0b333333333bbbb366b3bbb6b
000770000000ee000000ee000feee0000feee0000feee0000feee00044eee4000000eee0448ff5f0a9a97a9a9a97a9a900b000b0333b3333333b7b333b366bb3
00700700000eeee0000eeee0000ee000000ee000000ee000000ee0000f0ee0000000eeef444eeeefa9aaaa9a9a9999a900b00b0033336366673b3bb73bb336b3
0000000000f0110f00f0110f01105000001500000550100000510000005100000000051000f0eedda999999a9aaaaaa90000005066636666bb3bb33336b66bb6
00000000000100100001001000005000001500000000100000510000051000000000005100000eedaaaaaaaa999999990000000066666666bb3bbb36bbbbbbbb
0000000000000000000000000000000000000000c7cccc7ccccccccccccccccccccccccccccccccccccccccccccccccc66366666bbbbbbbbbbbb3666bbbbbbb6
5500005550000005500000000000000000000000ccc7ccccccc7ccc7cccccc7cccccccc7cc7ccc77cc7cc7ccc7cccc7c6bb333b6bb3bb33bb36bbbb33333bbbb
7077770775077057500770070000000000000000cccccccccccccccc77cccc77cccccccccc7cccc7ccccccccccccccccbbb33bbbb333333bbb766bb36666bb3b
70788707707887077078870700000000888888887cc77cc77ccccccc77cccc7c7cccccc7c77cccc7cc7ccccccccccc770b0b3bb03333333bb3333b3366bb663b
77788777777887777778877700000000aaaaaaaa77777cc7777cc7c77cccc7777cc777cc7cc7ccc77cccccccccccccc70b0bb50033333333b3663336636bb633
7077770700777700007777000000000088888888777777777c7cc7c7777cccc7c777777c7cc77cc77777c7777cccc7770b00b00033333633bb66bbb3666bb633
77777777000000000000000000000000000000007777777c777777777c777c77c7777777777cc777777777777c777c770bb0000036666666bb7b36336666333b
0000000000000000000000000000000000000000777c777c7777777777777777c77777cc7777777777777777777777770500000066666666bb3bb336b3333bb6
000000000000000000000000cccccccccccccccc04000040cccccccccccccccccccccccc66566666000000000031215500023320000000005555555599999999
070007000000000000000000cc77cccccccccc7c04400440c7ccc7ccccccc7ccccccc7cc333666560000000000512150000b3330000000005000004597777779
0760076000000000000000003cc77777cccc777c44444494c7ccc7ccc7ccccccc7cccccc33335666000000000055135000021330000000005440044597777779
0760076000000000000990003cccccccc7777cc34bb44bb4c7ccccccc7cccccccccccc7c66366636000000000055525000033332000000005444444599999999
0760076000009900009999003333c77ccccccc334b0440b4c7ccccccc7cccccccccccc7c6665663500000000055552500002b230000000005bb44bb500090000
076007700009999000999300333333333333333344444444c7ccc7ccc7cccccccccccc7c55666336000000000035513000033330000000005b1441b500090000
7777077000009900000993003333333333333333044004f4ccccc7cccccccccccc7ccccc66655366000000000055151000033310000000005b1441b500090000
77777777000030000000030033333333333333330044e444cccccccccccccccccccccccc663333650000000000b5355500023332000000005555555500090000
8000008009000900011111100000bbbbbbbb0000a088880acccccccccccccccccccccccc665566566665366603b11220000331300000000033333333a1131113
00900000000000080117878000bbbb3bb3bbbb00008aa800cccccc7ccc7ccccccc7ccccc33633336666536660031322000033310000000003dddddd31777777a
0008800980088000011787800bbbb33bb33bbbb00088880accc7cc7ccccccc7ccccccc7c336333bbb56636330033221000333330000000003d6666d337777771
0088880000899800111ffff00bb333bbbb333bb0a0044000ccc7cccccccccc7cc7cccccc36653bb6b66333330033222000331330000000003d7777d311a1311a
08899880089aa98001012000bb33bbbbbbbb33bb000ff000cccccccccccccc7cc7cccccc33333b66b33b33330033322b00033130000000003d6666d300010000
089aa980089aa98000211200b33bbbb00bbbb33b00044000cccccccccccccc7cc7cccccc33336666b63333330033122000022220000000003dddddd300010000
4544454445455544020120203bbbbb0000bbbbb3000ff000c7ccccccccccccccccccc7cc56333555333333360033323000033b20000000003d0d00d3000a0000
545454455454544500100100bbbb00000000bbbb00044000cccccccccccccccccccccccc56666333666666650333333000023130000000003333333300030000
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00bbbbbbbbbbbb0033333333000000000000bbbbbbbb000000000000033535303333333300000000
5bbbbbbbbbbbb55bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0bbbbbbbbbbbbbb03333333300000000000bbbbbbbbbb00000000000035355303335533300000000
5bbbbbbbbbb5555bbbbbbbbbbbbbbb5b5b5b5b5bb5bbbb5bbbbbbbbbbbbbbbbbbbb353330000000000bbbbbbbbbbbb000000000003535330bbbbbbbb00000000
3bb555bb5553353b5bbbbbbbbb55a53b5355555bb555bb3bbbbbbbbbbbbbbbbbbbbbb5330000000000bbbbbbbbbbbb00000000000353553000b0b0b000000000
35b533bb33b333a535b5b555b533333553333355bb335ba5bbbbb5a55a5bbbbb0bbbb53a000000000bbbb5a55a5bbbb0000000000333553000b000b000000000
53553a5b533333333a33533a5533533353333a3355333333bbb5533333355bbb00bbbbb30000000bbbb5533333355bbbb00000000533355000b00b0000000000
3a3533353333333333333333333333a33333333533333333bb533333333335bb0000bbbb000000bbbbb3333333333bbbbb000000035335300000005000000000
3333335a3333a353353333353533333533a33333333a3335553a33355333a35500000bbbbbbbbbbbbb3a33355333a3bbbbbbbbbb035335300000000000000000
33333333333333333333333333333333333333333333333353333333bbbbbbbb0b0b000353333333bb3bbb33333bbb5b3333333b033533503333333300000000
3a353353335333533335a35333533335333533533335a35333535335abbbb3bb030b000b33535335333b33a5333abbbb3333333b033535303335533300000000
33355333335533333333333333333333333333333335333353333333bbbb533bb00b00005333333333bb333333333b53333333bb03333350bbbbbbbb00000000
33333333335335533a33353333533333335335333555553333333333bbb3353bb00b000033333333b3bbbb33b5333bbab33333bb033335300bb0b0b000000000
33333a3333333333353333333333353335533a33353353333333333303bb3333b00b000033333333a33b3bb3333335b35a5b33bb033535300b00b0b000000000
35533333333333a3333333333333333333333333333333a35333353300b3333ab00bb00053333533333b3bb3553355bb33333bb0053335300b00b00000000000
335333333a33533333335533335333533333533333a3553335333333000033330000300035333333bb3bb33a53a355bb33bbbbb0033353500505b00000000000
33333353333333333333333333333333335333333333333333333353000003330000000033333353bb3bbb53b333bbbbbbbbab00033353300000000000000000
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb3335553333335333bbbbb5b5bbbbbb00bb0000bb0b0bb00bb3bb333333bb3a3b3b000bb3053335305533333300000000
bbbbbbbb3bbbbbb33bbbb3bbbbbbbbbb55333335553333355555555555333bb03bbb0b330b0b000bb3bb53a533bb53bbb3b0bb3b035535303333333300000000
3bbbbbb33bb33bbb3bbbbbbb333bbbb3335333333333333335555533335333bbbb3b033bb00b0003b3bb3333a3bb33bbb3b0b3bb03353350bbbbbbbb00000000
5555b5335555b533b535b3b3555b55335333335355353355553555535333353b0bb333bbb00bb00bbbb3333333333bbb0b30bbb0035535300000b0b000000000
3333335b33bb335bb3bb5555335555553335353535355353353353553535333b0003b000bb00300b3bb3333333b33bbb00000000033533500000000000000000
bbbbbb333b33bbbb3b33b3b33333333333353333333533333335333b3333333b033303000b00b00bbbbb3533b3bb35bb0b30bbb0053355300000000000000000
0bbbb33000000000bbbbbb300000000005555550000000000555555000000000b3b003bb3b00b00bb53b333a333b33bbb3b0b3bb035335300000000000000000
0bbb3b300000000003b33b3000000000033333300000000003333330000000003b00bb3bb000b00bb33b3353a33b3abb3b00bb33053335300000000000000000
0b3b3330033b3b30033b3b3000bbbbbb03533330333333330353553000b0b00b0b00b00bbb00bb0bb3bb3b33333b333333333333053333503323355500000000
0b5b5330035b53300b5333300bb33355035333303eaaaae30353353000b0300b0b000b0303b00b0b3333abb5a33353bb3eaaaae3035535303333333300000000
0b5b5330035b53300b333330bb333533035333303aaeaea3035333300030003b0b000b0b0bb00b0b5355333333bba3333aeaeaa303353330bbbbbbbb00000000
0b5353300353533003b33330b3533335035335303aeeaaa3035333300000000b03000b0b0b000b03b3353b33333333b33aaaeea3033333300b0bbbb000000000
0b3b5b30033b5b3003b3b330b3335353033335303aaaeea303533550000000030b00b00b0b00bb0b5a333b3333b33b333aeeaaa3033533300b0bb50000000000
0b355b300b355b3003333330b3333333033335303aeaeaa303533550000000000b00b00b0b00b00bb3333533b3bb35b33aaeaea3053335300b00b00000000000
0b355b300b355b300335333000000000033335303eaaaae303335550000000000b00b00b0b00bbbb333b3333333b333b3eaaaae3035335300bb0000000000000
03353b300b3b3b30033b333000000000033335303333333303355530000000000b0b300b0b000b0bb33b3a533a33333b33333333053333500500000000000000
__label__
88888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888
88888eeeeee888777777888eeeeee888eeeeee888888888888888888888888888888888888888888888ff8ff8888228822888222822888888822888888228888
8888ee888ee88778877788ee888ee88ee888ee88888888888888888888888888888888888888888888ff888ff888222222888222822888882282888888222888
888eee8e8ee8777787778eeeee8ee8eeeee8ee88888e88888888888888888888888888888888888888ff888ff888282282888222888888228882888888288888
888eee8e8ee8777787778eee888ee8eeee88ee8888eee8888888888888888888888888888888888888ff888ff888222222888888222888228882888822288888
888eee8e8ee8777787778eee8eeee8eeeee8ee88888e88888888888888888888888888888888888888ff888ff888822228888228222888882282888222288888
888eee888ee8777888778eee888ee8eee888ee888888888888888888888888888888888888888888888ff8ff8888828828888228222888888822888222888888
888eeeeeeee8777777778eeeeeeee8eeeeeeee888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1eee1e1e1ee111ee1eee1eee11ee1ee1111116661666166616661111161616661661166616661666117111711111111111111111111111111111111111111111
1e111e1e1e1e1e1111e111e11e1e1e1e111116111161161616111111161616161616161611611611171111171111111111111111111111111111111111111111
1ee11e1e1e1e1e1111e111e11e1e1e1e111116611161166116611111161616661616166611611661171111171111111111111111111111111111111111111111
1e111e1e1e1e1e1111e111e11e1e1e1e111116111161161616111111161616111616161611611611171111171111111111111111111111111111111111111111
1e1111ee1e1e11ee11e11eee1ee11e1e111116111666161616661666116616111666161611611666117111711111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111eee11ee1eee1111166611111eee1ee111111bbb1b111b11117116661666166616661166117111111ee111ee111111111111111111111111111111111111
11111e111e1e1e1e11111611111111e11e1e11111b1b1b111b11171116111161161616111611111711111e1e1e1e111111111111111111111111111111111111
11111ee11e1e1ee111111661111111e11e1e11111bbb1b111b11171116611161166116611666111711111e1e1e1e111111111111111111111111111111111111
11111e111e1e1e1e11111611111111e11e1e11111b1b1b111b11171116111161161616111116111711111e1e1e1e111111111111111111111111111111111111
11111e111ee11e1e1111161111111eee1e1e11111b1b1bbb1bbb117116111666161616661661117111111eee1ee1111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111666111116661666166616661666111111111cc111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111116111111116111611666161116161171177711c111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111116611111116111611616166116611777111111c111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111116111111116111611616161116161171177711c111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111611117111611666161616661616111111111ccc11111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111eee1eee1111166611111666166616661666166617111c1111111eee1e1e1eee1ee11111111111111111111111111111111111111111111111111111
1111111111e11e111111161111111161116116661611161611711c11111111e11e1e1e111e1e1111111111111111111111111111111111111111111111111111
1111111111e11ee11111166111111161116116161661166111171ccc111111e11eee1ee11e1e1111111111111111111111111111111111111111111111111111
1111111111e11e111111161111111161116116161611161611711c1c111111e11e1e1e111e1e1111111111111111111111111111111111111111111111111111
111111111eee1e111111161111711161166616161666161617111ccc111111e11e1e1eee1e1e1111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111166611111666166616661666166611111ccc11111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111161111111161116116661611161617771c1c11111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111166111111161116116161661166111111c1c11111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111161111111161116116161611161617771c1c11111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111161111711161166616161666161611111ccc11111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111116661111116616661666111111111cc1111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111161111111611161616161171177711c1111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111166111111666166616611777111111c1111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111111161111111116161116161171177711c1111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111116111171166116111616111111111ccc111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111eee1eee11111666111111661666166617111c1c1ccc11111eee1e1e1eee1ee11111111111111111111111111111111111111111111111111111
11111111111111e11e1111111611111116111616161611711c1c1c1c111111e11e1e1e111e1e1111111111111111111111111111111111111111111111111111
11111111111111e11ee111111661111116661666166111171ccc1ccc111111e11eee1ee11e1e1111111111111111111111111111111111111111111111111111
11111111111111e11e111111161111111116161116161171111c1c1c111111e11e1e1e111e1e1111111111111111111111111111111111111111111111111111
1111111111111eee1e111111161111711661161116161711111c1ccc111111e11e1e1eee1e1e1111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111666111111661666166611111c1c1ccc11111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111611111116111616161617771c1c1c1c11111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111661111116661666166111111ccc1ccc11111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111111161111111116161116161777111c111c11111111111711111111111111111111111111111111111111111111111111111111111111111111
1111111111111111161111711661161116161111111c111c11111111111771111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111777111111111111111111111111111111111111111111111111111111111111111111
11111111111111111eee1e1111ee1eee111111111111111111111111111777711111111111111111111111111111111111111111111111111111111111111111
11111111111111111e111e111e111e11111111111111111111111111111771111111111111111111111111111111111111111111111111111111111111111111
11111111111111111ee11e111eee1ee1111111111111111111111111111117111111111111111111111111111111111111111111111111111111111111111111
11111111111111111e111e11111e1e11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111eee1eee1ee11eee111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111888881111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111888881111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111888881111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111888881111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111888881111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111888881111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111eee1ee11ee111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111e111e1e1e1e11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111ee11e1e1e1e11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111e111e1e1e1e11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111eee1e1e1eee11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111eee1ee11ee1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111e111e1e1e1e111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111ee11e1e1e1e111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
111111111e111e1e1e1e111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
88888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888
82888222822882228888822282828882822282228222888888888888888888888888888888888888888882288222822282828882822282288222822288866688
82888828828282888888828282828828888288828882888888888888888888888888888888888888888888288882888282828828828288288282888288888888
82888828828282288888822282228828822288828882888888888888888888888888888888888888888888288882882282228828822288288222822288822288
82888828828282888888828288828828828888828882888888888888888888888888888888888888888888288882888288828828828288288882828888888888
82228222828282228888822288828288822288828882888888888888888888888888888888888888888882228882822288828288822282228882822288822288
88888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888

__gff__
0000000000000000000000000303030300000000000000000000000003030303030000030300000000030000000000000000000303000000000101000000000003030303030303030000030300010300030303000303000000030303030103000101010101010101030003030301030000000001000000000000030300010300
0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
__map__
686c687e4e5e6e4e7e6e5e4e7e6e5e4e69794e5e5e336c6c6c6c6c6c4e5e585e6e7e5e4e770000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000d0c1c0c1c1d000000000000003b000000000000002b2c
7471740000000000000000000000000058690000693468686868686c0000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005a3b2c3c3b2b003c002c000000000000000000000000000e000000000f000000000000002b000000000000003b2b
74707400000000000000000000000000007700005833685a5b68686c340000000000000000000000000000000000000f1e0d0f1f1e0e0f1f1d0f0e1e1f0d0f1e1f1d0d0e620e0000000000000000000000007a3b2c3c3b2b003c002c000000000000000000000000001e322121011f000000000000003b000000000000003b2c
740a7400000000000000000000000000000000000034687a6b68686c414243444547000000000000000000000000000f0c5800000000000000000000000000000000001e5b0f0000000000000000000000005b3b2c3c3b2b003c002c00000000000000000000000000404142434445000000000000002b000000000000002b3c
74717400000000000000000000210000000000000033795a7b79787978704e6e5878000000000000000000000000000f000000000000000000000000000000000000000f6b1e0000000000000000000000005b3b2c3c3b2b003c002c00000000000000000000000000000000000000000000000000003b000000000000003b2c
45404568210000000000000000464440424700000077586a5a7869776972000000000000000000000000000000000077000000000000000000000000000000000000001e7a1f0000000000000000000000005a3b2c3c3b2b003c002c00000000000000000000000000000000000000000000000000002b000000000000002b3c
50536b616267000000000000000e5455555500000000007a7b7758007772000000000000007362636700000000000000000000333400000000000000000000000000000e7b0f0000000000000000000000006b3b2c3c3b2b003c002c00000000000000000000000000000000000000000000000000003b000000000000003b2c
51537b3370340000000000006c1f5256505100000000007b6b00000000710000000000000033703400000000000000000000331d0d34000000000000000000000000000f6b0e0000000000332134000000007b3b2c3c3b2b003c003b00000000000000000000000000000000000000000000000000002b000000000000002b3c
54567a697169000000000068601e50530c5800000000006b6a000000007200000000000000007400000000000000000000331e0e0f1e340000000000210000000000001f5b0f00000000337b7b7b340000005a3b2c3c3b2b003c003b00000000000000000000000000000000000000000000000000003b000000000000003b2c
50516b4b716c002f00006c6a4a0f560e263600000000007b7a000000007100000000000000007200000000000000000000460d0f1e0f4700000000330d3400000000001e5a1f0000337b7b1f1f1f7b7b34006b3b2c3c3b2b003c003b00000000000000000000000000000000000000000000000000002b000000000000002b3c
50517c7a5140414240431d0d1d75561e362600000000005a5b0000000070000000000000000070636061626700000000000e0c691c791e000000001e1f0d00000000000e6a1e00000f7b0f297c390f7b1f00003b2c3c3b2b003c003b00000000000000000000000000000000000000000000000000003b000000000000003b2c
5e505653537a59597b565051507b51530e3600000000007a7b0000000072000000000000000071337134723400000000001e007900000e0000006c0e2e0e68000000000f7a0e00001f0e1e753e753a1e0f00003b2c3c3b2b003c003b00000000000000000000000000000000000000000000000000002b000000000000002b3c
555153565253525356545651505653546b26000000000069690000000071000000000000000072007000720000000000000e000a00001c0000001d29393a0f000000001e7b0f000021790f397c1f1f792100003b2c3c3b2b003c003b00000000004200000042000000000042000000000000004244474c002100000000003b3c
565656535353535353565653567518151815000000002179790000000070000000000000000074007000720000000000001e000e0000000030000f290c391f000021000e6b0f494a41424242424242424242424242423b2b003c003b00004200000000000000000000000000000000000000002c3b1d0d1d0d00000000002b3c
5352515052515252555250545426232423244b00004a4540414243454445404142470000004644444044724441444700005a421d0d1d0d4143454441404244434241424041434259595959595959595959595959595942424242424200000000000000000000000000210000000064000000002c3b0e36260f00000000001e00
5355565352515654565056565236545342434423245456565252565656565656565b0000006a26365e79727778585b00006a0c0c0e1f0f5959595959565656565959595959595959595959595959595959595959595959595959595900000000640000000000000000640000000000000000002c3b1e26361f00000000000e00
5650535656565656565154545326535153525356565452525254565654525256526b0000007a36260069720077006b00737a00001e0e595959595956565656565959595959595959595959595959595959595959595959595959595900000000000000000064000000000000000000000000002c391f36263a00000000001e00
4850505050505656565656535c3653547e545254562e525656527e52545654546b6b0000005a260a0077720000007b00005a00001f5959565959565656565656595959595959595959595959595959595959595959595959595959592020202020202020202020202020202020202020202020201f0e26363900000000000e00
0077790000000000007758000026545655565456565556525251565454545656546b0000007b36260000720000007a00007800000f5959565959565656565656595959595959595959595959595959595959595959595959595959595a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a0e1d0f1e36260e00000000000f00
00005800000000000000000000364e5e7e4e485556545652565656565656565656790000005741444345444340006a67007700211e595956595659565656565659595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959590f26362636150e000000006c6c2e
007363606700000000000000002600000000004e58777758000000580000775869690000000026360000000000005a000010001f0e595956565656565656565659595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959591f36260f0e0e0e00000000686c59
0000337200000000000000000036000000000000000000000000000000000000007900000000362600000000005e00000000490f5959595656565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959590f1f1e0d0f1e1f0e3926361e1c0c6900000000685959
00000072636267000000100000260000000000000000000000000000000000000058000000002636000000000000000046451f0e5959595656565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959590e0c001c000c001c70362671000077000000006c5959
000a007600713400000000000036000000000000000000000000002100000000000000000000362600000000000000006b5959595959595656565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959590f00002125210000702636710000000000006c685959
00000074217100000000000000260000000000000000004a454443424140424344474c000000263600210000000000496a5959595959595656565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959590e213533293435217015187121323000003f686c5959
0000404142434400000041000036404142430000000000697700000000000077487541404142434445404245444342415a59595959595656565656565656565659595959595959595959595959595959595959595959595959595959595959595959595959595959595955454041444543417523247c41424542434442405959
000000000000000000000000002669587979000000000058000000000000000000485c780000263600000000000000000e5959595959565656565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595559595559597c755959595559595959555959
000000000000000000000000003669004a4042470000000000000000000000000000007700003626000000000000000f1e59595959565656565656565656565659595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959
202040414243440000000000001546595059556b000000000000000000000000000a000000002636000000001000000e1f0d2e5959565656565656565656565659595959595959595959595959595959595959595959595959595959595959594545454545454545454545454545454545454545454545454545454545454545
404155565152564540202020204059595950597b00000021000000000000000000000000210015180000000000001e0f1e1f1e5959565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959595959590000000045000000000000000000000000000000000000
55595950595950596b434442415a5955595959754041424445434241404720202020204640424344454341404342404143451e5959595959565659595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959590000000000000000000000000000000000000000000000
5952595952555959595952595059595959525459595959595954595959754041424344755952595959595954565656565656565959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959595959590000000000000000000000000000000000000000000000
__sfx__
0401000005000060000000008000000000a000000000d00000000000001100013000140000000018000000001b0001e00000000210002500026000280002a00000000000002e0003200000000360003b0003e000
010b00000c0432e700187002e7000c043167001f7001f7000c04311700247001a0000c0430f70018700187000c043277001b7002e7000c0433070022700277000c0432e70027700307000c043307002e70033700
4d2c0000240042464524600246450050424645246002464529004246452460024635005002464524600246550050000500246002050020500205002460013000300003000024600240001b000005002460024600
4b2c00000c5540c5540f5540f55414554145541355413554115541155410554105540f5540f5540e5540e5540c5540c5540f5000f55414554145541355413554115541150010554105000f5540f5000f5540f500
002800000022000220002201322016220012100021000210002100021003210332100c210242103a2101b21003210032100321000210002100021000210002100021000210002100021000210002101622029230
001600000021003210032100321003210032100321003210032103320003210032100321003210002100021000210002100021000210002100021000210002100021000210002100321003220032200322003220
012c00000c5320c5321653216522145221452213522135220c5220c5221352213522145321453213532135320c5320c5220f5220f52214522145321353213532115321153210532105320f5320f5320e5320e522
002c00000c5220c522135221352214532145321353213532000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
002c00000c5320c5220f5220f52214522145321353213532000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
002c0000115321153210532105320f5320f5320e5320e522000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
002c0000054200542004420044200342003420024200242000100101000f1000f1000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
002c0000114201142010420104200f4200f4200e4200e4200c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001150
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000150
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000100003635029350233501b350123500d3500532000350033000130026300123000730002300143001630015300103000d30009300043000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00010000083500d350123501435017350193501b3501d350203502035025350243502a350253502e35026350303502635026350323502635033350263502635031350263502e350293502b35031350293503d350
00010000121501a1501b1501d1502815028150251502c1503515010150051500b1500215009150131501e15013150101501215015150181501a1501f150181500d15009150081500615004150031500315003150
000200000c15024150011500013001110011000010000100241002f1003210034100271003610036100261002e10022100201001d100011001a10017100121000e10009100061000410003100000000000000000
__music__
00 01024344
00 01024344
00 01020344
00 01020344
00 01020304
00 01020305
00 01020304
00 01020305
00 0142090a
00 0142090a
00 01420944
00 1942090b
02 41020344


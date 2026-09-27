"use strict";

const C=[
["ones","Ones"],["twos","Twos"],["threes","Threes"],["fours","Fours"],["fives","Fives"],["sixes","Sixes"],
["threeKind","Three of a Kind"],["fourKind","Four of a Kind"],["fullHouse","Full House"],
["smallStraight","Small Straight"],["largeStraight","Large Straight"],["chance","Chance"],["yacht","Yacht"]];
const U=["ones","twos","threes","fours","fives","sixes"];

const FINAL={
  1:{x:0,y:0,z:0},
  6:{x:0,y:180,z:0},
  2:{x:0,y:-90,z:0},
  5:{x:0,y:90,z:0},
  3:{x:90,y:0,z:0},
  4:{x:-90,y:0,z:0}
};

const S={
  mode:"solo",
  players:[],
  currentPlayer:0,
  dice:[1,1,1,1,1],
  held:[false,false,false,false,false],
  rollsUsed:0,
  gameOver:false,
  soloNewRecord:false,
  roomCode:"",
  yourIndex:-1,
  uid:"",
  ready:false,
  unsub:null,
  animationBusy:false,
  holdOrder:[],
  spin:[0,1,2,3,4].map(()=>({x:0,y:0,z:0})),
  trayPos:[
    {x:.14,y:.54},
    {x:.34,y:.30},
    {x:.52,y:.61},
    {x:.69,y:.34},
    {x:.81,y:.62}
  ]
};

let firebaseApi=null;
let firebaseLoadingPromise=null;
let db=null,auth=null;

const $=s=>document.querySelector(s);
const screens={menu:$("#menu"),online:$("#online"),lobby:$("#lobby"),game:$("#game")};

const SOLO_BEST_KEY="yachtDice.soloBest.v1";
function readSoloBest(){
  try{
    const raw=window.localStorage.getItem(SOLO_BEST_KEY);
    if(raw===null)return null;
    const value=Number(raw);
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }catch{return null}
}
let soloBest=readSoloBest();
function renderSoloBest(){
  $("#soloBestDisplay").textContent=`Solo Best: ${soloBest===null?"—":soloBest}`;
}
function recordSoloBest(value){
  if(soloBest!==null&&value<=soloBest)return false;
  soloBest=value;
  try{window.localStorage.setItem(SOLO_BEST_KEY,String(value))}catch{}
  renderSoloBest();
  return true
}

const POSES={default:"assets/character/default_hq.png",pleased:"assets/character/pleased.png",impressed:"assets/character/impressed.png",shocked:"assets/character/shocked.png"};
Object.values(POSES).forEach(src=>{const img=new Image();img.src=src});

const MUSIC_VOLUME=.70;
const MUSIC_VOICE_VOLUME=MUSIC_VOLUME*.75;
const MUSIC_TRACKS=Array.from({length:20},(_,i)=>`assets/audio/music_${String(i).padStart(2,"0")}.mp3`);
let musicTrackIndex=0;
const backgroundMusic=new Audio(MUSIC_TRACKS[0]);
backgroundMusic.preload="auto";
backgroundMusic.volume=MUSIC_VOLUME;
const nextMusicTrack=new Audio(MUSIC_TRACKS[1]);
nextMusicTrack.preload="auto";
let musicEnabled=true;
backgroundMusic.addEventListener("ended",()=>{
  musicTrackIndex=(musicTrackIndex+1)%MUSIC_TRACKS.length;
  backgroundMusic.src=MUSIC_TRACKS[musicTrackIndex];
  nextMusicTrack.src=MUSIC_TRACKS[(musicTrackIndex+1)%MUSIC_TRACKS.length];
  if(musicEnabled)startBackgroundMusic();
});
function updateMusicButton(){
  $("#musicToggle").textContent=musicEnabled?"Music: On":"Music: Off";
  $("#musicToggle").setAttribute("aria-pressed",String(musicEnabled));
}
function startBackgroundMusic(){
  if(!musicEnabled||!backgroundMusic.paused)return;
  backgroundMusic.play().catch(()=>{musicEnabled=false;updateMusicButton()});
}
function toggleBackgroundMusic(){
  musicEnabled=!musicEnabled;
  if(musicEnabled)startBackgroundMusic();
  else backgroundMusic.pause();
  updateMusicButton();
}

const diceRollAudio=new Audio("assets/audio/dice_roll.mp3");
diceRollAudio.preload="auto";
diceRollAudio.volume=.8;
function playDiceRoll(){
  diceRollAudio.pause();diceRollAudio.currentTime=0;
  diceRollAudio.play().catch(()=>{});
}

const VOICE_FILES={
  yacht:"assets/audio/yacht.mp3",
  large_straight:"assets/audio/large_straight.mp3",
  four_kind:"assets/audio/four_kind.mp3",
  full_house:"assets/audio/full_house.mp3",
  small_straight:"assets/audio/small_straight.mp3",
  three_kind:"assets/audio/three_kind.mp3"
};
const voicePlayers=Object.fromEntries(Object.entries(VOICE_FILES).map(([key,src])=>{
  const audio=new Audio(src);audio.preload="auto";audio.volume=.9;return[key,audio]
}));
let activeVoice=null;
function stopVoice(){if(activeVoice){activeVoice.pause();activeVoice.currentTime=0;activeVoice=null}backgroundMusic.volume=MUSIC_VOLUME}
function playVoice(key){
  stopVoice();
  const audio=voicePlayers[key];
  if(!audio)return;
  audio.currentTime=0;activeVoice=audio;
  backgroundMusic.volume=MUSIC_VOICE_VOLUME;
  audio.onended=()=>{if(activeVoice===audio){activeVoice=null;backgroundMusic.volume=MUSIC_VOLUME}};
  audio.play().catch(()=>{if(activeVoice===audio){activeVoice=null;backgroundMusic.volume=MUSIC_VOLUME}});
}

let reactionTimer=0,reactionSequence=0;
const MOTIONS=["motion-good","motion-yacht"];
function resetReaction(keepVoice=false){
  clearTimeout(reactionTimer);if(!keepVoice)stopVoice();reactionSequence++;
  const portrait=$("#characterImage"),bubble=$("#reactionBubble"),stage=$(".character-visual");
  portrait.src=POSES.default;stage.classList.remove(...MOTIONS);
  bubble.className="reaction-bubble";bubble.textContent="";
}
function animateCharacter(kind,line="",label="",voiceKey=""){
  clearTimeout(reactionTimer);
  const sequence=++reactionSequence,portrait=$("#characterImage"),bubble=$("#reactionBubble"),stage=$(".character-visual");
  stage.classList.remove(...MOTIONS);
  portrait.src=POSES[{good:"impressed",yacht:"shocked"}[kind]];
  void stage.offsetWidth;stage.classList.add(`motion-${kind}`);
  bubble.className=`reaction-bubble${line?` visible ${kind}`:""}`;bubble.textContent=line;
  if(label){const sub=document.createElement("small");sub.textContent=label;bubble.appendChild(sub)}
  if(voiceKey)playVoice(voiceKey);
  reactionTimer=setTimeout(()=>{if(sequence===reactionSequence)resetReaction()},kind==="yacht"?4600:3500);
}
function reactToRoll(){
  if(!S.rollsUsed||S.gameOver){resetReaction();return}
  const c=counts(S.dice),max=Math.max(...c);
  if(yacht(S.dice))animateCharacter("yacht","うそっ!? ヤッツィー!!","YACHT · An unbelievable roll","yacht");
  else if(score("largeStraight",S.dice))animateCharacter("good","すごい！完璧だ！","LARGE STRAIGHT","large_straight");
  else if(max>=4)animateCharacter("good","見事だ！やるじゃないか。","FOUR OF A KIND","four_kind");
  else if(score("fullHouse",S.dice))animateCharacter("good","いいぞ、その調子だ！","FULL HOUSE","full_house");
  else if(score("smallStraight",S.dice))animateCharacter("good","いい感じだ！","SMALL STRAIGHT","small_straight");
  else if(max>=3)animateCharacter("good","いいぞ！","THREE OF A KIND","three_kind");
  else resetReaction();
}
function queueRollReaction(){
  resetReaction();
  const sequence=reactionSequence;
  setTimeout(()=>{if(sequence===reactionSequence)reactToRoll()},1460);
}

function show(n){Object.values(screens).forEach(x=>x.classList.remove("active"));screens[n].classList.add("active")}
function player(name,uid=""){return{name,scores:{},yachtBonusCount:0,uid}}
function gameState(){return{currentPlayer:0,dice:[1,1,1,1,1],held:[false,false,false,false,false],rollsUsed:0,gameOver:false}}
function counts(d){const c=Array(7).fill(0);d.forEach(v=>c[v]++);return c}
function seq(a,b){return b.every(v=>a.includes(v))}
function eq(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i])}

function score(id,d){
  const c=counts(d),t=d.reduce((a,b)=>a+b,0),u=[];
  for(let n=1;n<=6;n++)if(c[n])u.push(n);
  switch(id){
    case"ones":return c[1];
    case"twos":return c[2]*2;
    case"threes":return c[3]*3;
    case"fours":return c[4]*4;
    case"fives":return c[5]*5;
    case"sixes":return c[6]*6;
    case"threeKind":return c.some(x=>x>=3)?t:0;
    case"fourKind":return c.some(x=>x>=4)?t:0;
    case"fullHouse":return((c.includes(3)&&c.includes(2))||c.includes(5))?25:0;
    case"smallStraight":return(seq(u,[1,2,3,4])||seq(u,[2,3,4,5])||seq(u,[3,4,5,6]))?30:0;
    case"largeStraight":return(eq(u,[1,2,3,4,5])||eq(u,[2,3,4,5,6]))?40:0;
    case"chance":return t;
    case"yacht":return c.includes(5)?50:0;
    default:return 0;
  }
}
function yacht(d){return counts(d).includes(5)}
function upper(p){return U.reduce((s,id)=>s+(p.scores?.[id]||0),0)}
function ub(p){return upper(p)>=63?35:0}
function yb(p){return(p.yachtBonusCount||0)*100}
function total(p){return Object.values(p.scores||{}).reduce((a,b)=>a+b,0)+ub(p)+yb(p)}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function code6(){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",r=new Uint32Array(6);crypto.getRandomValues(r);return Array.from(r,x=>a[x%a.length]).join("")}
function meTurn(){return S.mode==="solo"||S.yourIndex===S.currentPlayer}

function makeFace(n){
  const f=document.createElement("div");
  f.className=`face face-${n}`;
  const img=document.createElement("img");
  img.src=`assets/dice/basic/dice_${n}.png`;
  img.alt=String(n);
  f.appendChild(img);
  return f
}
function makeCube(value,size="tray"){
  const cube=document.createElement("div");
  cube.className="die3d";
  [1,6,2,5,3,4].forEach(n=>cube.appendChild(makeFace(n)));
  orientCube(cube,value,false);
  return cube
}
function orientCube(cube,value,animate,index=0){
  const t=FINAL[value];
  if(!animate){
    cube.classList.remove("spin");
    cube.style.transform=`rotateX(${t.x}deg) rotateY(${t.y}deg) rotateZ(${t.z}deg)`;
    return
  }
  const s=S.spin[index];
  s.x+=(2+Math.floor(Math.random()*3))*360;
  s.y+=(2+Math.floor(Math.random()*4))*360;
  s.z+=(1+Math.floor(Math.random()*3))*360;
  cube.classList.add("spin");
  requestAnimationFrame(()=>{
    cube.style.transform=`rotateX(${s.x+t.x}deg) rotateY(${s.y+t.y}deg) rotateZ(${s.z+t.z}deg)`;
  })
}

async function loadFirebaseSdk(){
  if(firebaseApi)return firebaseApi;
  if(firebaseLoadingPromise)return firebaseLoadingPromise;
  firebaseLoadingPromise=(async()=>{
    const[a,b,c]=await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js")
    ]);
    firebaseApi={
      initializeApp:a.initializeApp,
      getAuth:b.getAuth,
      signInAnonymously:b.signInAnonymously,
      onAuthStateChanged:b.onAuthStateChanged,
      getDatabase:c.getDatabase,
      ref:c.ref,
      get:c.get,
      set:c.set,
      update:c.update,
      onValue:c.onValue,
      runTransaction:c.runTransaction
    };
    return firebaseApi
  })();
  try{return await firebaseLoadingPromise}
  finally{firebaseLoadingPromise=null}
}
async function initFB(){
  if(S.ready)return true;
  if(!window.isFirebaseConfigured||!window.isFirebaseConfigured()){
    $("#setupWarn").classList.remove("hidden");
    $("#onlineMsg").textContent="Firebase is not configured yet.";
    return false
  }
  try{
    const api=await loadFirebaseSdk();
    const app=api.initializeApp(window.firebaseConfig);
    auth=api.getAuth(app);db=api.getDatabase(app);
    const u=await new Promise((res,rej)=>{
      const off=api.onAuthStateChanged(auth,x=>{if(x){off();res(x)}},rej);
      api.signInAnonymously(auth).catch(rej)
    });
    S.uid=u.uid;S.ready=true;
    $("#setupWarn").classList.add("hidden");
    return true
  }catch(e){
    $("#onlineMsg").textContent="Firebase connection failed: "+e.message;
    $("#setupWarn").classList.remove("hidden");
    return false
  }
}

function resetSpins(){S.spin=[0,1,2,3,4].map(()=>({x:0,y:0,z:0}))}
function startSolo(){
  startBackgroundMusic();
  unsub();
  S.mode="solo";
  S.players=[player("Player")];
  S.currentPlayer=0;
  S.yourIndex=0;
  S.gameOver=false;
  S.soloNewRecord=false;
  resetSpins();
  show("game");
  resetReaction();
  startTurn()
}
function startTurn(){
  S.dice=[1,1,1,1,1];
  S.held=[false,false,false,false,false];
  S.holdOrder=[];
  S.rollsUsed=0;
  resetReaction(true);
  randomizeTrayTargets();
  render(false)
}
function randomizeTrayTargets(){
  const presets=[
    [{x:.15,y:.56},{x:.32,y:.29},{x:.52,y:.61},{x:.68,y:.35},{x:.82,y:.60}],
    [{x:.18,y:.31},{x:.35,y:.61},{x:.50,y:.38},{x:.69,y:.63},{x:.80,y:.29}],
    [{x:.14,y:.64},{x:.31,y:.37},{x:.48,y:.66},{x:.66,y:.31},{x:.82,y:.51}]
  ];
  S.trayPos=presets[Math.floor(Math.random()*presets.length)].map(p=>({...p}))
}

function localRoll(){
  if(S.rollsUsed>=3||S.animationBusy)return;
  if(!S.held.every(Boolean))playDiceRoll();
  S.dice=S.dice.map((v,i)=>(S.rollsUsed===0||!S.held[i])?Math.floor(Math.random()*6)+1:v);
  S.rollsUsed++;
  randomizeTrayTargets();
  render(true);
  queueRollReaction()
}
function localScore(id){
  const p=S.players[0];
  if(!S.rollsUsed||S.animationBusy||Object.hasOwn(p.scores,id))return;
  const bonus=yacht(S.dice)&&Object.hasOwn(p.scores,"yacht")&&p.scores.yacht===50;
  p.scores[id]=score(id,S.dice);
  if(bonus)p.yachtBonusCount++;
  if(Object.keys(p.scores).length===13){
    S.gameOver=true;
    S.soloNewRecord=recordSoloBest(total(p));
    render(false);
    showResult()
  }else startTurn()
}
function toggleHoldLocal(i){
  if(!S.rollsUsed||S.animationBusy)return;
  if(S.held[i]){
    S.held[i]=false;
    S.holdOrder=S.holdOrder.filter(index=>index!==i);
  }else{
    S.held[i]=true;
    if(!S.holdOrder.includes(i))S.holdOrder.push(i);
  }
  renderDice(false);
  renderHoldSlots()
}

async function createRoom(){
  if(!S.ready&&!(await initFB()))return;
  for(let k=0;k<12;k++){
    const code=code6(),rr=firebaseApi.ref(db,"rooms/"+code);
    if((await firebaseApi.get(rr)).exists())continue;
    await firebaseApi.set(rr,{
      status:"waiting",
      players:[player($("#nameInput").value.trim().slice(0,16)||"Player",S.uid)],
      game:gameState(),
      createdAt:Date.now()
    });
    S.mode="online";S.roomCode=code;subscribe(code);return
  }
  $("#onlineMsg").textContent="Could not create a room."
}
async function joinRoom(){
  if(!S.ready&&!(await initFB()))return;

  const code=$("#codeInput").value.trim().toUpperCase();
  if(code.length!==6){
    $("#onlineMsg").textContent="Enter the 6-character room code.";
    return;
  }

  $("#onlineMsg").textContent="Joining room...";

  const rr=firebaseApi.ref(db,"rooms/"+code);

  try{
    // First verify the room from the server.
    const snap=await firebaseApi.get(rr);
    if(!snap.exists()){
      $("#onlineMsg").textContent="Room not found.";
      return;
    }

    const room=snap.val();
    if(room.status!=="waiting"){
      $("#onlineMsg").textContent="This match has already started.";
      return;
    }

    const players=Array.isArray(room.players)
      ? room.players
      : Object.values(room.players||{});

    if(players.length!==1){
      $("#onlineMsg").textContent="This room is already full.";
      return;
    }

    // Atomically claim the Player 2 seat.
    // Here null is the normal/expected value, so Firebase's initial-null
    // transaction behavior cannot falsely abort the join.
    const seatRef=firebaseApi.ref(db,`rooms/${code}/players/1`);
    const newPlayer=player(
      $("#nameInput").value.trim().slice(0,16)||"Player",
      S.uid
    );

    const seat=await firebaseApi.runTransaction(
      seatRef,
      current=>current===null?newPlayer:undefined,
      {applyLocally:false}
    );

    if(!seat.committed){
      $("#onlineMsg").textContent="Another player joined this room first.";
      return;
    }

    // Finish the room transition in one multi-location update.
    await firebaseApi.update(rr,{
      status:"playing",
      game:gameState(),
      updatedAt:Date.now()
    });

    S.mode="online";
    S.roomCode=code;
    $("#onlineMsg").textContent="";
    subscribe(code);
  }catch(e){
    console.error("joinRoom failed",e);
    $("#onlineMsg").textContent="Could not join the room. Please try again.";
  }
}
function unsub(){if(S.unsub){S.unsub();S.unsub=null}}
function subscribe(code){
  unsub();
  S.unsub=firebaseApi.onValue(firebaseApi.ref(db,"rooms/"+code),snap=>{
    if(!snap.exists()){show("menu");return}
    applyRoom(snap.val(),code)
  })
}
function syncHoldOrderFromFlags(){
  S.holdOrder=S.holdOrder.filter(i=>S.held[i]);
  for(let i=0;i<5;i++){
    if(S.held[i]&&!S.holdOrder.includes(i))S.holdOrder.push(i);
  }
}

function applyRoom(room,code){
  const oldRolls=S.rollsUsed;
  const p=Array.isArray(room.players)?room.players:Object.values(room.players||{});
  S.players=p;
  S.yourIndex=p.findIndex(x=>x.uid===S.uid);
  S.currentPlayer=room.game?.currentPlayer??0;
  S.dice=room.game?.dice||[1,1,1,1,1];
  S.held=room.game?.held||[false,false,false,false,false];
  syncHoldOrderFromFlags();
  S.rollsUsed=room.game?.rollsUsed||0;
  S.gameOver=!!room.game?.gameOver;
  S.roomCode=code;
  S.mode="online";

  if(room.status==="waiting"){
    $("#roomCode").textContent=code;
    $("#lobbyPlayers").innerHTML=p.map((x,i)=>`<p>Player ${i+1}: ${esc(x.name)}</p>`).join("");
    show("lobby");
    return
  }

  if(S.rollsUsed>oldRolls){
    randomizeTrayTargets();
    if(!S.held.every(Boolean))playDiceRoll();
  }
  show("game");
  render(S.rollsUsed>oldRolls);
  if(S.rollsUsed>oldRolls)queueRollReaction();
  if(S.gameOver)showResult()
}
async function action(a){
  if(S.animationBusy)return;
  const rr=firebaseApi.ref(db,"rooms/"+S.roomCode);
  const r=await firebaseApi.runTransaction(rr,room=>{
    if(!room||room.status!=="playing"||room.game.gameOver)return;
    const p=Array.isArray(room.players)?room.players:Object.values(room.players||{});
    const mi=p.findIndex(x=>x.uid===S.uid);
    if(mi<0||room.game.currentPlayer!==mi)return;

    if(a.type==="roll"){
      if(room.game.rollsUsed>=3)return;
      for(let i=0;i<5;i++){
        if(room.game.rollsUsed===0||!room.game.held[i]){
          room.game.dice[i]=Math.floor(Math.random()*6)+1
        }
      }
      room.game.rollsUsed++
    }else if(a.type==="hold"){
      const i=Number(a.index);
      if(!Number.isInteger(i)||i<0||i>4||!room.game.rollsUsed)return;
      room.game.held[i]=!room.game.held[i]
    }else if(a.type==="score"){
      const id=String(a.id),pl=p[mi];
      pl.scores=pl.scores||{};
      if(!room.game.rollsUsed||!C.some(x=>x[0]===id)||Object.hasOwn(pl.scores,id))return;
      const bonus=yacht(room.game.dice)&&Object.hasOwn(pl.scores,"yacht")&&pl.scores.yacht===50;
      pl.scores[id]=score(id,room.game.dice);
      if(bonus)pl.yachtBonusCount=(pl.yachtBonusCount||0)+1;
      room.players=p;
      const done=p.length===2&&p.every(x=>Object.keys(x.scores||{}).length===13);
      if(done){
        room.status="finished";
        room.game.gameOver=true
      }else{
        room.game.currentPlayer=room.game.currentPlayer?0:1;
        room.game.dice=[1,1,1,1,1];
        room.game.held=[false,false,false,false,false];
        room.game.rollsUsed=0
      }
    }else return;

    room.updatedAt=Date.now();
    return room
  },{applyLocally:false});

  if(!r.committed)$("#rollInfo").textContent="That action is not available right now."
}
async function rematch(){
  if(S.mode!=="online"){startSolo();return}
  await firebaseApi.runTransaction(firebaseApi.ref(db,"rooms/"+S.roomCode),room=>{
    if(!room)return;
    const p=Array.isArray(room.players)?room.players:Object.values(room.players||{});
    if(p.length!==2)return;
    p.forEach(x=>{x.scores={};x.yachtBonusCount=0});
    room.players=p;room.status="playing";room.game=gameState();return room
  },{applyLocally:false})
}

function render(animateDice=false){
  renderTop();
  renderBoards();
  renderDice(animateDice);
  renderHoldSlots();
  if(!S.gameOver)$("#result").classList.add("hidden")
}
function renderTop(){
  const p=S.players[S.currentPlayer];
  if(!p)return;
  $("#turnLabel").textContent=`${p.name}'s Turn${S.mode==="online"?(meTurn()?" · Your Turn":" · Opponent's Turn"):""}`;
  $("#modeLabel").textContent=S.mode==="online"?`ONLINE · ${S.roomCode}`:"SOLO";
  $("#turnCounter").textContent=`${Object.keys(p.scores||{}).length} / 13`;

  if(S.gameOver){
    $("#rollInfo").textContent="Game Over";
    $("#rollBtn").disabled=true;
    return
  }
  if(!meTurn()){
    $("#rollInfo").textContent="Waiting for your opponent...";
    $("#rollBtn").disabled=true;
    return
  }
  $("#rollInfo").textContent=`Rolls: ${S.rollsUsed} / 3`;
  $("#rollBtn").disabled=S.rollsUsed>=3||S.animationBusy;
  $("#rollBtn").textContent=S.rollsUsed===0?"ROLL!":S.rollsUsed<3?`ROLL!  ${3-S.rollsUsed}`:"DONE"
}
function renderBoards(){
  const box=$("#boards");
  box.innerHTML="";
  box.classList.remove("online-score-view");

  const upperCategories=C.slice(0,6);
  const lowerCategories=C.slice(6);

  const addSectionHeader=(bd,title,extraClass="")=>{
    const section=document.createElement("div");
    section.className=`score-section-header ${extraClass}`.trim();
    section.textContent=title;
    bd.appendChild(section);
  };

  const addCategoryRow=(bd,p,pi,[id,label])=>{
    const row=document.createElement("div");
    row.className="score-row";

    const n=document.createElement("span");
    n.textContent=label;

    const b=document.createElement("button");
    const cur=!S.gameOver&&pi===S.currentPlayer;
    const used=Object.hasOwn(p.scores||{},id);

    if(used){
      b.textContent=p.scores[id];
      b.disabled=true;
    }else if(cur&&meTurn()&&S.rollsUsed&&!S.animationBusy){
      const s=score(id,S.dice);
      b.textContent=`+${s}`;
      b.classList.add("available");
      if(s===0)b.classList.add("zero");
      b.onclick=()=>S.mode==="online"
        ? action({type:"score",id})
        : localScore(id);
    }else{
      b.textContent="-";
      b.disabled=true;
    }

    row.append(n,b);
    bd.appendChild(row);
  };

  const renderFullBoard=(p,pi,isOnlineOwn=false)=>{
    const bd=document.createElement("article");
    bd.className=`board ${isOnlineOwn?"online-own-board":""}`.trim();

    const cur=!S.gameOver&&pi===S.currentPlayer;
    bd.innerHTML=`<h3>${esc(p.name)}${cur?" · Current Turn":""}</h3>`;

    addSectionHeader(bd,"UPPER SECTION","upper-section");
    upperCategories.forEach(cat=>addCategoryRow(bd,p,pi,cat));

    const upperSummary=document.createElement("div");
    upperSummary.className="section-summary upper-section-summary";
    upperSummary.innerHTML=`
      <span>Upper Total<strong>${upper(p)} / 63</strong></span>
      <span>Upper Bonus<strong>${ub(p)}</strong></span>`;
    bd.appendChild(upperSummary);

    addSectionHeader(bd,"LOWER SECTION","lower-section");
    lowerCategories.forEach(cat=>addCategoryRow(bd,p,pi,cat));

    const yachtBonusRow=document.createElement("div");
    yachtBonusRow.className="score-row yacht-bonus-row";
    yachtBonusRow.innerHTML=`
      <span>Yacht Bonus</span>
      <button disabled>${yb(p)}</button>`;
    bd.appendChild(yachtBonusRow);

    const totalSummary=document.createElement("div");
    totalSummary.className="section-summary total-summary";
    totalSummary.innerHTML=`
      <span>Total Score<strong>${total(p)}</strong></span>
      <span>Turns<strong>${Object.keys(p.scores||{}).length} / 13</strong></span>`;
    bd.appendChild(totalSummary);

    box.appendChild(bd);
  };

  if(S.mode!=="online"){
    S.players.forEach((p,pi)=>renderFullBoard(p,pi,false));
    return;
  }

  box.classList.add("online-score-view");

  const myIndex=S.yourIndex>=0?S.yourIndex:0;
  const opponentIndex=S.players.findIndex((_,i)=>i!==myIndex);

  const me=S.players[myIndex];
  if(me)renderFullBoard(me,myIndex,true);

  if(opponentIndex>=0){
    const opp=S.players[opponentIndex];
    const summary=document.createElement("article");
    summary.className="opponent-score-card";

    const cur=!S.gameOver&&opponentIndex===S.currentPlayer;
    summary.innerHTML=`
      <div class="opponent-score-head">
        <span>OPPONENT</span>
        <strong>${esc(opp.name)}${cur?" · Turn":""}</strong>
      </div>
      <div class="opponent-score-grid">
        <span>Score<strong>${total(opp)}</strong></span>
        <span>Upper<strong>${upper(opp)} / 63</strong></span>
        <span>Bonus<strong>${ub(opp)}</strong></span>
        <span>Yacht Bonus<strong>${yb(opp)}</strong></span>
        <span>Turns<strong>${Object.keys(opp.scores||{}).length} / 13</strong></span>
      </div>`;

    box.appendChild(summary);
  }
}
function trayPixelPosition(i){
  const tray=$("#tray");
  const rect=tray.getBoundingClientRect();
  const die=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--die-size"))||96;
  const p=S.trayPos[i];
  return {
    x:Math.max(8,Math.min(rect.width-die-8,p.x*rect.width-die/2)),
    y:Math.max(26,Math.min(rect.height-die-8,p.y*rect.height-die/2))
  }
}
function throwVars(slot,i){
  const tray=$("#tray").getBoundingClientRect();
  const to=trayPixelPosition(i);
  const startX=tray.width*.46 + (i-2)*16;
  const startY=tray.height+65+i*3;
  const midX=(startX+to.x)/2 + (i%2===0?-55:55);
  const midY=Math.max(18,to.y-90-(i%3)*14);
  const nearX=to.x+(i%2===0?18:-18);
  const nearY=to.y-18;

  slot.style.setProperty("--from-x",`${startX}px`);
  slot.style.setProperty("--from-y",`${startY}px`);
  slot.style.setProperty("--mid-x",`${midX}px`);
  slot.style.setProperty("--mid-y",`${midY}px`);
  slot.style.setProperty("--near-x",`${nearX}px`);
  slot.style.setProperty("--near-y",`${nearY}px`);
  slot.style.setProperty("--to-x",`${to.x}px`);
  slot.style.setProperty("--to-y",`${to.y}px`);
}
function createTrayDie(i){
  const slot=document.createElement("div");
  slot.className="die-slot";
  slot.dataset.index=String(i);
  const cube=makeCube(S.dice[i]);
  slot.appendChild(cube);
  slot.onclick=()=>{
    if(!S.rollsUsed||S.animationBusy||!meTurn()||S.gameOver)return;
    if(S.mode==="online"){
      if(S.held[i]) S.holdOrder=S.holdOrder.filter(index=>index!==i);
      else if(!S.holdOrder.includes(i)) S.holdOrder.push(i);
      action({type:"hold",index:i});
    }else toggleHoldLocal(i)
  };
  return slot
}
function renderDice(animate=false){
  const layer=$("#diceLayer");

  // Keep only non-held dice in the tray.
  const visibleIndices=[];
  for(let i=0;i<5;i++)if(!S.held[i])visibleIndices.push(i);

  // Rebuild tray slots for deterministic positioning.
  layer.innerHTML="";
  let animatedCount=0;

  for(const i of visibleIndices){
    const slot=createTrayDie(i);
    const cube=slot.querySelector(".die3d");
    throwVars(slot,i);

    if(S.rollsUsed===0){
      // Before first roll: line them up low in the tray, no animation.
      const tray=$("#tray").getBoundingClientRect();
      const die=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--die-size"))||96;
      const x=tray.width/2 + (i-2)*(die+12) - die/2;
      const y=tray.height- die - 22;
      slot.style.transform=`translate(${x}px,${y}px)`;
      orientCube(cube,1,false,i);
    }else if(animate){
      animatedCount++;
      slot.classList.add("throwing");
      orientCube(cube,S.dice[i],true,i);
      const delay=i*55;
      slot.style.animationDelay=`${delay}ms`;
      cube.style.transitionDelay=`${delay}ms`;

      window.setTimeout(()=>{
        const finalPos=trayPixelPosition(i);
        slot.style.animationDelay="0ms";
        slot.style.transform=`translate(${finalPos.x}px,${finalPos.y}px)`;
        slot.classList.remove("throwing");
      },780+delay);
    }else{
      const p=trayPixelPosition(i);
      slot.style.transform=`translate(${p.x}px,${p.y}px)`;
      orientCube(cube,S.dice[i],false,i);
    }

    layer.appendChild(slot)
  }

  if(animatedCount>0){
    S.animationBusy=true;
    renderTop();
    renderBoards();
    window.setTimeout(()=>{
      S.animationBusy=false;
      renderTop();
      renderBoards();
      renderDice(false);
    },1480)
  }
}

function renderHoldSlots(){
  const box=$("#holdSlots");
  box.innerHTML="";
  syncHoldOrderFromFlags();

  for(let slotIndex=0;slotIndex<5;slotIndex++){
    const slot=document.createElement("div");
    slot.className="hold-slot";
    const dieIndex=S.holdOrder[slotIndex];

    if(dieIndex===undefined){
      slot.classList.add("empty");
    }else{
      const held=document.createElement("div");
      held.className="held-die";
      const cube=makeCube(S.dice[dieIndex],"hold");
      held.appendChild(cube);
      held.onclick=()=>{
        if(S.animationBusy||!meTurn()||S.gameOver)return;
        if(S.mode==="online"){
          S.holdOrder=S.holdOrder.filter(index=>index!==dieIndex);
          action({type:"hold",index:dieIndex});
        }else{
          toggleHoldLocal(dieIndex);
        }
      };
      slot.appendChild(held);
    }
    box.appendChild(slot);
  }
}
function showResult(){
  if(!S.gameOver)return;
  if(S.players.length===1){
    $("#resultTitle").textContent=`Final Score: ${total(S.players[0])}`;
    $("#resultText").textContent=`${S.soloNewRecord?"New Record! · ":""}Solo Best: ${soloBest===null?"—":soloBest}`
  }else{
    const[a,b]=S.players,ta=total(a),tb=total(b);
    $("#resultTitle").textContent=ta>tb?`${a.name} Wins!`:tb>ta?`${b.name} Wins!`:"Draw!";
    $("#resultText").textContent=`${a.name}: ${ta} · ${b.name}: ${tb}`
  }
  $("#result").classList.remove("hidden")
}

$("#soloBtn").onclick=startSolo;
$("#onlineBtn").onclick=()=>{startBackgroundMusic();show("online");initFB()};
$("#onlineBackBtn").onclick=()=>show("menu");
$("#toggleJoinBtn").onclick=()=>$("#joinBox").classList.toggle("hidden");
$("#createBtn").onclick=createRoom;
$("#joinBtn").onclick=joinRoom;
$("#codeInput").oninput=()=>$("#codeInput").value=$("#codeInput").value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
$("#leaveBtn").onclick=()=>{unsub();show("menu")};
$("#menuBtn").onclick=()=>{unsub();show("menu")};
$("#musicToggle").onclick=toggleBackgroundMusic;
$("#restartBtn").onclick=rematch;
$("#resultRestartBtn").onclick=rematch;
$("#rollBtn").onclick=()=>S.mode==="online"?action({type:"roll"}):localRoll();

window.addEventListener("resize",()=>{
  if($("#game").classList.contains("active")&&!S.animationBusy)renderDice(false)
});

updateMusicButton();
renderSoloBest();
show("menu");
window.YachtTest={score,FINAL};

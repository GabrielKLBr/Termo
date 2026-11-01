import { BOARD_STYLE, ROW_STYLE } from './styles.js';

const MODES = Object.freeze({termo: {name:'Termo', count:1, attempts:6},duo:{name:'Dueto',count:2,attempts:7},quatro:{name:'Quarteto',count:4,attempts:9}});
const STORAGE='termo-template-v1'; // Preserva partidas e estatísticas antigas compatíveis.
const ACCEPT=/^[a-záàâãéêíóôõúüç]{5}$/iu;
const NORM=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const $=s=>document.querySelector(s);
const bar=$('wc-bar'), header=$('wc-header'), note=$('wc-notify'), boardContainer=$('#boards'), keyboard=$('wc-kbd'), modal=$('wc-modal');
const settings=loadJSON(`${STORAGE}:settings`,{high:false,nav:true});
let mode='termo',game=null,instance=[],notifier=null,finishTimer=null,turnTimer=null,locked=false;
let activeModeAnimations=[],activeModeGhostLayer=null;
// Cada modalidade mantém sua própria sessão, inclusive se localStorage falhar no file://.
const sessions=Object.create(null);
// O JSON gerado por prepare_dictionary.py é a única fonte de palpites e respostas.
// A versão HTML único incorpora o mesmo JSON, dispensando fetch/file://.
let dictionary=new Set(), answerSet=new Set(), sourceWords=[], dictionaryComplete=false;


function loadJSON(key,def){try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw):def;}catch{return def;}}
function persist(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
function save(){if(game){sessions[mode]=game;persist(`${STORAGE}:game:${mode}`,game);}}
function statsFor(m){const d=loadJSON(`${STORAGE}:stats:${m}`,null);return d&&typeof d.played==='number'?d:{played:0,wins:0,streak:0,best:0,hist:{}};}
function saveSettings(){persist(`${STORAGE}:settings`,settings);}
function randomInt(max){if(max<=0)return 0;const cryptoObj=globalThis.crypto;if(cryptoObj?.getRandomValues){const b=new Uint32Array(1);const maxVal=2**32;const lim=maxVal-(maxVal%max);do{cryptoObj.getRandomValues(b);}while(b[0]>=lim);return b[0]%max;}return Math.floor(Math.random()*max);}
function chooseWords(m){if(!dictionaryComplete)throw Error('Dicionário ainda não disponível');
 const count=MODES[m].count;
 const all=sourceWords;
 const previous=loadJSON(`${STORAGE}:last:${m}`,[]), p=new Set(Array.isArray(previous)?previous.map(NORM):[]);
 // Evita respostas iguais entre partidas ativas de modalidades distintas.
 const otherAnswers=new Set(['termo','duo','quatro'].filter(k=>k!==m).flatMap(k=>{
  const saved=sessions[k]||loadJSON(`${STORAGE}:game:${k}`,null);
  return validGame(saved,k)&&!saved.finished?saved.answers.map(NORM):[];
 }));
 const distinct=all.filter(w=>!otherAnswers.has(NORM(w)));
 const available=distinct.filter(w=>!p.has(NORM(w)));
 const pool=(available.length>=count?available:distinct.length>=count?distinct:all).slice();
 if(pool.length<count)throw Error('O banco não contém respostas suficientes para esta modalidade');
 const chosen=[];
 for(let i=0;i<count;i++)chosen.push(pool.splice(randomInt(pool.length),1)[0]);
 persist(`${STORAGE}:last:${m}`,chosen);return chosen;
}
function freshGame(m){return {v:2,mode:m,answers:chooseWords(m),rounds:[],solved:Array(MODES[m].count).fill(false),solvedAt:Array(MODES[m].count).fill(null),current:Array(5).fill(''),cursor:0,finished:false,won:false,recorded:false,created:Date.now()};}
function validGame(g,m){return g&&(g.v===1||g.v===2)&&g.mode===m&&Array.isArray(g.answers)&&g.answers.length===MODES[m].count&&g.answers.every(w=>typeof w==='string'&&ACCEPT.test(w)&&answerSet.has(NORM(w)))&&Array.isArray(g.rounds)&&g.rounds.length<=MODES[m].attempts&&Array.isArray(g.current)&&g.current.length===5&&Array.isArray(g.solved)&&g.solved.length===g.answers.length;}

// Web Components originais mantidos com seu Shadow DOM próprio. Suas folhas
// são reaproveitadas de UMA definição extraída do HTML, não uma cópia por linha.
const rowSheet=new CSSStyleSheet();rowSheet.replaceSync(ROW_STYLE);
const boardSheet=new CSSStyleSheet();boardSheet.replaceSync(BOARD_STYLE);
// Durante o movimento, o quadrado pode estar fora do tamanho FINAL do tabuleiro.
boardSheet.insertRule(':host([mode-morphing]) { overflow: visible; }',boardSheet.cssRules.length);
class TermRow extends HTMLElement{
 connectedCallback(){if(this.shadowRoot)return;let sh=this.attachShadow({mode:'open'});sh.adoptedStyleSheets=[rowSheet];for(let i=0;i<5;i++){const c=document.createElement('div');c.className='letter';c.setAttribute('lid',i);c.setAttribute('term-pos',i);c.setAttribute('role','text');c.setAttribute('aria-label','');c.tabIndex=-1;sh.appendChild(c);}}
 get cells(){return [...this.shadowRoot.querySelectorAll('.letter')];}
}
class TermBoard extends HTMLElement{
 connectedCallback(){if(this.shadowRoot)return;const sh=this.attachShadow({mode:'open'});sh.adoptedStyleSheets=[boardSheet];const hold=document.createElement('div');hold.id='hold';sh.appendChild(hold);}
 get rows(){return [...this.shadowRoot.querySelector('#hold').querySelectorAll('wc-row')];}
}
customElements.define('wc-row',TermRow);
customElements.define('wc-board',TermBoard);
// Transição FLIP (First, Last, Invert, Play): mantém os mesmos wc-row e as
// mesmas cinco peças sempre que um tabuleiro existe nas duas modalidades.
// As peças se deslocam e mudam de tamanho até a geometria final; apenas as
// fileiras novas aparecem e as fileiras removidas desaparecem suavemente.
const MODE_MORPH_MS=510;
const MODE_MORPH_EASING='cubic-bezier(.22, 1, .36, 1)';
function stopModeAnimation(){
 instance.forEach(board=>board.removeAttribute('mode-morphing'));
 for(const anim of activeModeAnimations)anim.cancel();
 activeModeAnimations=[];
 activeModeGhostLayer?.remove();activeModeGhostLayer=null;
}
function wantsModeMotion(){return !!globalThis.Element?.prototype?.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches;}
function rememberBoardGeometry(nextMode){
 if(!wantsModeMotion()||!instance.length)return null;
 const before=new Map(), departing=[];
 const keptBoards=MODES[nextMode].count, keptRows=MODES[nextMode].attempts;
 instance.forEach((board,b)=>board.rows.forEach((row,r)=>{
  before.set(`${b}:${r}`,row.getBoundingClientRect());
  if(b>=keptBoards||r>=keptRows){
   // O Shadow DOM impede cloneNode de copiar as peças: copiamos somente o
   // estilo visível dos cinco quadrados para uma camada temporária inerte.
   departing.push(row.cells.map(cell=>{
    const rect=cell.getBoundingClientRect(),css=getComputedStyle(cell);
    return {rect,text:cell.textContent,color:css.color,background:css.backgroundColor,
     border:css.border,borderRadius:css.borderRadius,font:css.font,
     fontWeight:css.fontWeight};
   }));
  }
 }));
 return {before,departing};
}
function showDepartingRows(rows){
 if(!rows.length)return;
 const layer=document.createElement('div');layer.className='mode-morph-ghosts';
 layer.setAttribute('aria-hidden','true');
 layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:50;overflow:hidden;contain:layout style';
 document.body.appendChild(layer);activeModeGhostLayer=layer;
 rows.forEach((cells,r)=>cells.forEach((item,i)=>{
  const el=document.createElement('span'),{rect}=item;
  el.textContent=item.text;
  Object.assign(el.style,{position:'absolute',left:`${rect.left}px`,top:`${rect.top}px`,
   width:`${rect.width}px`,height:`${rect.height}px`,display:'flex',alignItems:'center',
   justifyContent:'center',boxSizing:'border-box',color:item.color,backgroundColor:item.background,
   border:item.border,borderRadius:item.borderRadius,font:item.font,fontWeight:item.fontWeight});
  layer.appendChild(el);
  const anim=el.animate([
   {opacity:1,transform:'translateY(0px) scale(1)'},
   {opacity:0,transform:'translateY(-6px) scale(.97)'}
  ],{duration:MODE_MORPH_MS*.78,delay:Math.min(r*18,95),easing:'ease-in-out',fill:'both'});
  activeModeAnimations.push(anim);
 }));
}
function playBoardMorph(snapshot){
 if(!snapshot)return;
 instance.forEach(board=>board.setAttribute('mode-morphing',''));
 showDepartingRows(snapshot.departing);
 instance.forEach((board,b)=>board.rows.forEach((row,r)=>{
  const previous=snapshot.before.get(`${b}:${r}`),next=row.getBoundingClientRect();
  if(!next.width||!next.height)return;
  row.style.transformOrigin='top left';
  let frames,delay=0;
  if(previous?.width&&previous?.height){
   const dx=previous.left-next.left,dy=previous.top-next.top;
   const sx=previous.width/next.width,sy=previous.height/next.height;
   // Um modo pode mudar só o número de tentativas, sem mudar colunas.
   // Mesmo assim, as linhas compartilhadas recebem o morph do tamanho.
   frames=[{transform:`translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,opacity:1},
           {transform:'translate(0px, 0px) scale(1, 1)',opacity:1}];
  }else{
   delay=Math.min(145,r*25+b*28);
   frames=[{transform:'translateY(11px) scale(.96)',opacity:0},
           {transform:'translateY(0px) scale(1)',opacity:1}];
  }
  const anim=row.animate(frames,{duration:MODE_MORPH_MS,delay,easing:MODE_MORPH_EASING,fill:'both'});
  activeModeAnimations.push(anim);
 }));
 const animations=[...activeModeAnimations],layer=activeModeGhostLayer;
 Promise.allSettled(animations.map(a=>a.finished)).then(()=>{
  // Não cancelar ou remover animações de uma troca iniciada em seguida.
  if(animations.some(a=>!activeModeAnimations.includes(a)))return;
  animations.forEach(a=>a.cancel());
  instance.forEach(board=>board.removeAttribute('mode-morphing'));
  activeModeAnimations=[];
  if(activeModeGhostLayer===layer){layer?.remove();activeModeGhostLayer=null;}
 });
}
function createBoards({morph=null}={}){
 const former=morph?instance:[];
 const next=[];
 for(let b=0;b<MODES[mode].count;b++){
  // Reutilizar o Web Component preserva o mesmo elemento e seus quadrados.
  const el=former[b]||document.createElement('wc-board');
  if(!el.shadowRoot)boardContainer.appendChild(el); // connectedCallback cria o Shadow DOM.
  el.id=`board${b}`;el.setAttribute('rows',MODES[mode].attempts);
  el.setAttribute('role','group');el.setAttribute('aria-label',`Tabuleiro ${b+1}`);
  el.setAttribute('aria-live','polite');
  const hold=el.shadowRoot.querySelector('#hold');
  const formerRows=former[b]?.rows||[];
  const nextRows=[];
  for(let r=0;r<MODES[mode].attempts;r++){
   let row=formerRows[r];
   if(!row){
    row=document.createElement('wc-row');
    hold.appendChild(row); // Inicializa as cinco células antes de escutar cliques.
    row.setAttribute('role','group');row.tabIndex=-1;
    row.cells.forEach((cell,p)=>{
     cell.addEventListener('click',()=>{
      if(!locked&&!game.finished&&game.rounds.length===r&&!game.solved[b]){
       game.cursor=p;save();renderEditable();
      }
     });
    });
   }
   row.setAttribute('term-row',r);
   row.setAttribute('aria-label',`Palavra ${r+1}`);
   nextRows.push(row);
  }
  hold.replaceChildren(...nextRows);
  next.push(el);
 }
 boardContainer.replaceChildren(...next);instance=next;
 // Medir o destino logo após a troca de CSS, antes de desenhar cada quadro.
 resizeBoards();renderAll();
 if(morph)playBoardMorph(morph);
}
function resizeBoards(){if(!instance.length)return;
 const rect=boardContainer.getBoundingClientRect(),style=getComputedStyle(boardContainer);
 const innerWidth=rect.width-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
 const innerHeight=rect.height-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0);
 const portraitFour=mode==='quatro'&&!matchMedia('(min-width: 100vh)').matches;
 const cols=mode==='termo'?1:mode==='duo'?2:(portraitFour?2:4), rows=mode==='quatro'&&portraitFour?2:1;
 const cg=parseFloat(style.columnGap)||0,rg=parseFloat(style.rowGap)||0;
 const w=Math.max(1,(innerWidth - cg*(cols-1))/cols),h=Math.max(1,(innerHeight-rg*(rows-1))/rows);
 const turnCount=MODES[mode].attempts;
 // Original: cada linha mede 5*1em + 4*0.0625em; 0.4em são as margens do wc-board.
 const size=Math.max(8,Math.floor(Math.min((w-4)/(5+4*.0625+.4),(h-4)/(turnCount+(turnCount-1)*.0625))));
 instance.forEach(board=>{board.style.fontSize=`${size}px`;});
}
function displayCell(cell,letter,kind,edit=false,animate=false,delay=0,emptyVariant='active'){
 cell.className='letter';cell.style.animation='';cell.style.animationDelay='';cell.style.backgroundColor='';cell.style.border='';cell.textContent=letter||'';cell.setAttribute('aria-label',letter?`${letter}: ${kind==='right'?'posição correta':kind==='place'?'outra posição':kind==='wrong'?'ausente':'sem avaliação'}`:'vazio');
 if(kind==='future'){cell.classList.add('future');}
 else if(kind){cell.classList.add(kind);if(!animate){cell.style.animation='none';cell.style.backgroundColor=kind==='right'?'var(--colorRight)':kind==='place'?'var(--colorPlace)':'var(--colorWrong)';cell.style.border='none';}else cell.style.animationDelay=`${delay}ms`;}
 else if(!letter)cell.classList.add(emptyVariant==='future'?'future':'empty');
 else cell.classList.add('pending'); // Letra ainda não confirmada: não mudar o fundo.
 if(edit)cell.classList.add('edit');
}
function renderAll(){if(!game)return;for(let b=0;b<instance.length;b++)for(let r=0;r<MODES[mode].attempts;r++)renderRow(b,r);renderKeyboard();}
function renderRow(b,r,animate=false){const row=instance[b]?.rows[r];if(!row)return;
 const past=game.rounds[r];const isActive=!game.finished&&!game.solved[b]&&r===game.rounds.length;
 const feedback=past?.feedback?.[b];
 row.cells.forEach((cell,i)=>{
  if(feedback){displayCell(cell,past.word[i],feedback[i],false,animate,i*205);}
  else if(isActive){displayCell(cell,game.current[i],null,game.current.includes('')&&i===game.cursor);}
  else displayCell(cell,'',null,false,false,0,'future');
 });
}
function renderEditable(){for(let b=0;b<instance.length;b++)if(!game.solved[b])renderRow(b,game.rounds.length);}
function popType(position){for(let b=0;b<instance.length;b++)if(!game.solved[b]){
 const cell=instance[b]?.rows[game.rounds.length]?.cells[position];if(!cell)continue;
 cell.classList.remove('ontype');void cell.offsetWidth;cell.classList.add('ontype');setTimeout(()=>cell.classList.remove('ontype'),170);
}}
function notify(message,ms=1850){clearTimeout(notifier);note.textContent=message;const msg=note.shadowRoot?.getElementById('msg');if(!msg)return;
 msg.style.animation='none';msg.style.opacity='0';void msg.offsetWidth;msg.style.animation='popup .25s ease-out forwards';msg.style.opacity='1';notifier=setTimeout(()=>{msg.style.transition='opacity .25s';msg.style.opacity='0';},ms);
}
function invalidGuess(message){notify(message);for(const b of instance){if(game.solved[instance.indexOf(b)])continue;
 const row=b.rows[game.rounds.length];if(!row)continue;
 row.style.animation='none';void row.offsetWidth;row.style.animation='rownope .45s ease-in-out';setTimeout(()=>row.style.animation='',480);
}}
function nextEmptyAfter(position){
 // Avançar para a próxima casa vazia, pulando preenchidas e dando a volta
 // até a primeira lacuna. 5 indica que a linha está inteiramente completa.
 for(let step=1;step<=5;step++){
  const i=(position+step)%5;
  if(!game.current[i])return i;
 }
 return 5;
}
function typeLetter(ch){if(!game||game.finished||locked)return;ch=NORM(ch);if(!/^[A-Z]$/.test(ch))return;
 const pos=game.cursor===5?game.current.findIndex(value=>!value):game.cursor;
 if(pos<0||pos>=5)return;
 game.current[pos]=ch;
 game.cursor=nextEmptyAfter(pos);save();renderEditable();popType(pos);
}
function advanceCursor(){if(!game||game.finished||locked)return;
 // O espaço pula uma casa sem escrever e sem apagar a letra que já está nela.
 // 5 é a posição após a última casa, igual ao avanço após digitar a 5ª letra.
 if(game.cursor<5){game.cursor++;save();renderEditable();}
}
function eraseLetter(){if(!game||game.finished||locked)return;
 let i=game.cursor;
 // Uma linha completa tem cursor 5: apagar última casa e selecioná-la,
 // sem saltar mais uma casa para trás.
 if(i===5)i=4;
 else if(i>0&&!game.current[i]){
  let previous=i-1;
  while(previous>=0&&!game.current[previous])previous--;
  if(previous>=0)i=previous;
 }
 if(i>=0&&i<5&&game.current[i]){
  game.current[i]='';game.cursor=i;save();renderEditable();
 }
}
function evaluate(guess,answer){const g=[...NORM(guess)],s=[...NORM(answer)],out=Array(5).fill('wrong'),remaining={};
 for(let i=0;i<5;i++){if(g[i]===s[i]){out[i]='right';}else remaining[s[i]]=(remaining[s[i]]||0)+1;}
 for(let i=0;i<5;i++)if(out[i]!=='right'&&remaining[g[i]]>0){out[i]='place';remaining[g[i]]--;}
 return out;
}
function submit(){if(!game||game.finished||locked)return;
 const guess=game.current.join('');if(guess.length!==5)return invalidGuess('A palavra precisa ter cinco letras');
 // Toda tentativa deve existir no índice de 11 mil+ palavras do Python.
 if(!dictionaryComplete)return invalidGuess('Dicionário indisponível');
 if(!dictionary.has(NORM(guess)))return invalidGuess('Essa palavra não está no dicionário');
 const rowIndex=game.rounds.length;
 const feedback=game.answers.map((answer,b)=>game.solved[b]?null:evaluate(guess,answer));
 game.rounds.push({word:guess,feedback});
 for(let b=0;b<feedback.length;b++)if(feedback[b]&&feedback[b].every(x=>x==='right')){game.solved[b]=true;game.solvedAt[b]=rowIndex;}
 game.won=game.solved.every(Boolean);
 game.finished=game.won||game.rounds.length===MODES[mode].attempts;
 game.current=Array(5).fill('');game.cursor=0;save();
 locked=true;
 for(let b=0;b<instance.length;b++)if(feedback[b])renderRow(b,rowIndex,true);
 if(game.won){setTimeout(()=>{for(let b=0;b<instance.length;b++){let r=game.solvedAt[b];if(r!==null)celebrate(instance[b].rows[r]);}},1170);}
 clearTimeout(turnTimer);
 turnTimer=setTimeout(()=>{locked=false;renderAll();if(game.finished){finalize();notify(game.won?'Parabéns! Você acertou!':'Fim de jogo!');finishTimer=setTimeout(()=>openFinished(),400);}},Math.max(5*205+450,1350)+(game.won?700:0));
}
function celebrate(row){if(!row)return;row.cells.forEach((c,i)=>{c.style.animation=`happy .55s ease-in-out ${i*75}ms`;setTimeout(()=>{c.style.animation='none';c.style.backgroundColor='var(--colorRight)';},650+i*75);});}
function finalize(){if(!game.finished||game.recorded)return;
 const stats=statsFor(mode);stats.played++;
 if(game.won){stats.wins++;stats.streak++;stats.best=Math.max(stats.best,stats.streak);const used=game.rounds.length;stats.hist[used]=(stats.hist[used]||0)+1;}else stats.streak=0;
 game.recorded=true;persist(`${STORAGE}:stats:${mode}`,stats);save();
}
const ranking={wrong:1,place:2,right:3};
// As cores são independentes por tabuleiro: a melhor ocorrência de cada
// letra em cada resposta determina seu quadrante (ou metade no Dueto).
function renderKeyboard(){const kbd=keyboard.shadowRoot;if(!kbd||!game)return;
 const count=MODES[mode].count;
 const byBoard=Array.from({length:count},()=>Object.create(null));
 for(const rd of game.rounds)for(let b=0;b<count;b++){
  const statuses=rd.feedback?.[b];
  if(!statuses)continue; // Tabuleiro já resolvido, manter a cor anterior.
  for(let i=0;i<5;i++){
   const letter=rd.word[i].toLowerCase(),status=statuses[i];
   if((ranking[status]||0)>(ranking[byBoard[b][letter]]||0))byBoard[b][letter]=status;
  }
 }
 const labelFor={right:'na posição correta',place:'em outra posição',wrong:'ausente'};
 kbd.querySelectorAll('button[id^="kbd_"]').forEach(button=>{
  const letter=button.id.substring(4);
  button.classList.remove('right','place','wrong','split-2','split-4');
  for(let i=0;i<4;i++)button.style.removeProperty(`--key-board-${i}`);
  if(letter==='backspace')return button.setAttribute('aria-label','Apagar letra');
  if(letter==='enter')return button.setAttribute('aria-label','Confirmar palavra');
  const statuses=byBoard.map(board=>board[letter]);
  if(statuses.every(status=>!status)){
   button.setAttribute('aria-label',letter.toUpperCase());return;
  }
  // O Termo original apaga a tecla quando a letra não serve em nenhuma palavra.
  if(statuses.every(status=>status==='wrong'))button.classList.add('wrong');
  else if(count===1)button.classList.add(statuses[0]);
  else{
   button.classList.add(`split-${count}`);
   for(let b=0;b<count;b++){
    const fill=statuses[b]==='right'?'var(--colorRight)':
     statuses[b]==='place'?'var(--colorPlace)':
     statuses[b]==='wrong'?'#312A2C':'#4C4347';
    button.style.setProperty(`--key-board-${b}`,fill);
   }
  }
  button.setAttribute('aria-label',`${letter.toUpperCase()}: `+statuses.map((status,b)=>
   `tabuleiro ${b+1} ${labelFor[status]||'sem avaliação'}`).join(', '));
 });
}
function handleKey(value){if(modal.getAttribute('aria-hidden')==='false')return;
 if(value==='ENTER')return submit();
 if(value==='BACKSPACE')return eraseLetter();
 if(value==='SPACE')return advanceCursor();
 typeLetter(value);
}
function selectMode(m,updateUrl=true){if(!dictionaryComplete){notify('Carregando dicionário...');return;}if(!MODES[m])m='termo';
 const switching=!!game&&mode!==m;
 // Medições antes da mudança de modo, inclusive se a animação anterior
 // ainda estiver em curso (cliques rápidos entre Termo/Dueto/Quarteto).
 const morph=switching?rememberBoardGeometry(m):null;
 stopModeAnimation();
 if(game){if(game.finished)finalize();save();}
 clearTimeout(turnTimer);clearTimeout(finishTimer);locked=false;
 mode=m;const conf=MODES[m];
 for(const key of ['termo','duo','quatro']){const style=$(`#style_${key}`);style.setAttribute('media',key===m?'':'not all');}
 header.lastChild.textContent=conf.name;
 document.title=`${conf.name} ilimitado`;
 const nav=bar.shadowRoot;for(const key of ['termo','duo','quatro']){nav.getElementById(key)?.classList.toggle('nope',key===m);}
 const stored=sessions[m]||loadJSON(`${STORAGE}:game:${m}`,null);
 game=validGame(stored,m)?stored:freshGame(m);
 if(game.finished&&!game.recorded)finalize();
 // Ao voltar para uma modalidade já encerrada, começa outra rodada automaticamente.
 // Partidas EM ANDAMENTO são sempre restauradas de forma independente.
 if(switching&&game.finished)game=freshGame(m);
 save();persist(`${STORAGE}:active-mode`,m);
 // Alguns navegadores móveis proíbem replaceState em arquivos file://.
 // Uma falha nessa etapa nunca pode impedir a renderização da nova modalidade.
 createBoards({morph});closeModal();
 if(updateUrl){try{const u=new URL(location.href);u.searchParams.set('modo',m);history.replaceState(null,'',u);}
  catch(e){console.debug('URL não atualizada neste navegador; o modo permanece funcional.',e);}}
}
function newGame(){if(!dictionaryComplete){notify('Dicionário indisponível');return;}stopModeAnimation();clearTimeout(turnTimer);clearTimeout(finishTimer);locked=false;
 if(game&&!game.finished&&game.rounds.length>0&&!confirm('Abandonar a partida atual e começar uma nova?'))return;
 game=freshGame(mode);save();createBoards();closeModal();notify('Nova partida!');
}

// Modal original wc-modal: mantém o backdrop, #all, #box e slot do template.
let modalTitle='';
function openModal(html,title){modalTitle=title;modal.innerHTML=`<section id="modal-content"><button class="close-dialog" type="button" data-action="close" aria-label="Fechar">×</button>${html}</section>`;
 modal.setAttribute('aria-label',title);modal.setAttribute('aria-hidden','false');modal.style.display='block';modal.querySelector('.close-dialog')?.focus();}
function closeModal(){modal.style.display='none';modal.setAttribute('aria-hidden','true');modal.replaceChildren();}
function help(){const cfg=MODES[mode];openModal(`<h2>Como jogar</h2><p>Descubra ${cfg.count===1?'a palavra secreta':`as ${cfg.count} palavras secretas`} de cinco letras em até <b>${cfg.attempts} tentativas</b>.</p><p>Insira uma palavra válida e pressione ENTER. Use a barra de espaço para pular à próxima casa sem digitar uma letra. A cor das peças mostra quão perto você está da resposta.</p>
<p><span class="help-letter right">A</span><span class="help-letter">M</span><span class="help-letter">O</span><span class="help-letter">R</span><span class="help-letter">A</span></p><p>Verde: a letra está na posição certa.</p>
<p><span class="help-letter place">R</span><span class="help-letter">O</span><span class="help-letter">M</span><span class="help-letter">A</span><span class="help-letter">S</span></p><p>Amarelo: a letra existe na palavra, mas está em outra posição.</p>
<p><span class="help-letter wrong">X</span><span class="help-letter">Y</span><span class="help-letter">Z</span></p><p>Escuro: a letra não aparece (ou já teve todas as suas ocorrências contabilizadas).</p>
<p>${cfg.count===1?'':`No ${cfg.name}, cada tentativa vale simultaneamente para todos os tabuleiros ainda não resolvidos.`} Acentos são ignorados na comparação e letras repetidas têm tratamento individual.</p>
<p><button data-action="close">Entendi!</button></p>`, 'Ajuda');}
function settingsPanel(){openModal(`<h2>Configurações</h2><label class="switch-row"><span>Modo de alto contraste</span><input id="high-toggle" type="checkbox" ${settings.high?'checked':''}></label>
<label class="switch-row"><span>Mostrar barra dos modos</span><input id="nav-toggle" type="checkbox" ${settings.nav?'checked':''}></label>
<p><button data-action="new">Nova partida</button> <button data-action="stats" class="secondary">Estatísticas</button></p>
<p><button data-action="reset-stats" class="secondary">Apagar estatísticas deste modo</button></p>
<p class="message-line">Termo, Dueto e Quarteto possuem partidas e estatísticas independentes, salvas automaticamente.</p>`, 'Configurações');}
function statsPanel(){const s=statsFor(mode),cfg=MODES[mode],bars=Array.from({length:cfg.attempts},(_,i)=>i+1).map(n=>{const value=s.hist[n]||0;const max=Math.max(1,...Object.values(s.hist));return `<div class="bar-item"><span>${n}</span><div style="width:${Math.max(7,Math.round(value/max*82))}%;">${value}</div></div>`;}).join('');
openModal(`<h2>Estatísticas · ${cfg.name}</h2><div class="stats-grid"><div><strong>${s.played}</strong><small>Jogos</small></div><div><strong>${s.played?Math.round(s.wins/s.played*100):0}%</strong><small>Vitórias</small></div><div><strong>${s.streak}</strong><small>Sequência</small></div><div><strong>${s.best}</strong><small>Recorde</small></div></div><h3>Distribuição de tentativas</h3>${bars}<p><button data-action="new">Nova partida</button>${game.finished?'<button data-action="share" class="secondary">Compartilhar</button>':''}</p>`, 'Estatísticas');}
function shareText(){const icons={right:'🟩',place:'🟨',wrong:'⬛'};
 const title=`${MODES[mode].name} ilimitado · ${game.won?game.rounds.length:'X'}/${MODES[mode].attempts}`;
 const boards=game.answers.map((_,b)=>game.rounds.map((r,i)=>{
  const f=r.feedback[b];return f?f.map(v=>icons[v]).join(''):null;
 }).filter(Boolean).join('\n')).join('\n\n');
 return `${title}\n\n${boards}\n\n${location.origin==='null'?'':location.origin+location.pathname}`.trim();}
async function share(){if(!game.finished)return notify('Termine a partida para compartilhar');const output=shareText();
 try{if(navigator.share){await navigator.share({text:output});return;}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(output);notify('Resultado copiado!');return;}}
 catch(e){if(e.name==='AbortError')return;}
 const field=document.createElement('textarea');field.value=output;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();try{document.execCommand('copy');notify('Resultado copiado!');}catch{notify('Não foi possível copiar.');}field.remove();
}
function openFinished(){if(!game.finished)return;finalize();const txt=game.answers.map((a,i)=>`<b>${i+1}.</b> ${a.toLocaleUpperCase('pt-BR')} ${game.solved[i]?'✓':'✕'}`).join('<br>');
 openModal(`<h2>${game.won?'Parabéns!':'Fim de jogo'}</h2><p>${game.won?`Você resolveu ${MODES[mode].count===1?'a palavra':'todos os tabuleiros'} em ${game.rounds.length} ${game.rounds.length===1?'tentativa':'tentativas'}.`:'Não foi desta vez. As palavras eram:'}</p><p>${txt}</p><p><button data-action="share">Compartilhar resultado</button><button data-action="new">Jogar novamente</button><button data-action="stats" class="secondary">Estatísticas</button></p>`, 'Fim de jogo');}
function about(){const n=dictionary.size.toLocaleString('pt-BR'), a=sourceWords.length.toLocaleString('pt-BR');
 openModal(`<h2>Sobre</h2><p>Versão ilimitada, independente, inspirada no jogo Termo. Interface e animações reconstruídas diretamente a partir do arquivo HTML fornecido.</p><p>Banco de palavras derivado de <a href="https://github.com/fserb/pt-br" target="_blank" rel="noopener noreferrer">fserb/pt-br</a> (licença MIT), processado pelo <code>prepare_dictionary.py</code>.</p><p id="dict-status" class="message-line">${dictionaryComplete?`Banco carregado: <b>${n} palpites válidos</b> e <b>${a} possíveis respostas</b>. Funciona offline.`:'Banco ainda não carregado.'}</p><p>O SQLite e o JSON são gerados juntos. No navegador, o jogo lê o JSON equivalente ao banco SQLite, inclusive no HTML único.</p><p><button data-action="close">Fechar</button></p>`, 'Sobre');}

// O navegador não acessa SQLite diretamente. prepare_dictionary.py gera
// dictionary.sqlite3 e dictionary.json com os MESMOS índices e respostas.
// O segundo é a versão portátil do DB, lida pelo site e embutida no HTML único.
function parseDictionary(data){
 if(!data||!Array.isArray(data.index)||!Array.isArray(data.answers))throw Error('Formato de banco inválido: esperados index e answers');
 const accepted=new Set();
 for(const item of data.index){
  if(!Array.isArray(item)||item.length!==2||typeof item[0]!=='string'||typeof item[1]!=='string'||
     !/^[A-Z]{5}$/.test(item[0])||!ACCEPT.test(item[1])||NORM(item[1])!==item[0])throw Error('Índice do banco inválido');
  accepted.add(item[0]);
 }
 const answers=new Map();
 for(const spelling of data.answers){
  if(typeof spelling!=='string'||!ACCEPT.test(spelling)||!accepted.has(NORM(spelling)))throw Error('Resposta ausente do índice do banco');
  answers.set(NORM(spelling),spelling.toLocaleLowerCase('pt-BR'));
 }
 if(accepted.size<100||answers.size<100)throw Error('Banco de palavras incompleto');
 if(data.meta?.accepted!=null&&data.meta.accepted!==accepted.size)throw Error('Total de palpites diferente dos metadados');
 if(data.meta?.answers!=null&&data.meta.answers!==answers.size)throw Error('Total de respostas diferente dos metadados');
 return {accepted,answers:new Set(answers.keys()),sourceWords:[...answers.values()],meta:data.meta||null};
}
function useCorpus(data){const parsed=parseDictionary(data);
 dictionary=parsed.accepted;answerSet=parsed.answers;sourceWords=parsed.sourceWords;
 dictionaryComplete=true;
 renderKeyboard();
}
async function loadCorpus(){
 const embedded=document.getElementById('termo-dictionary-data');
 if(embedded){useCorpus(JSON.parse(embedded.textContent));return;}
 // Electron usa a ponte isolada: fetch(file://) não é confiável e não precisa de servidor.
 if(window.termoDesktop?.loadDictionary){useCorpus(await window.termoDesktop.loadDictionary());return;}
 const response=await fetch('./data/dictionary.json');
 if(!response.ok)throw Error(`HTTP ${response.status} ao ler data/dictionary.json`);
 useCorpus(await response.json());
}
function wire(){const nav=bar.shadowRoot;
 for(const m of ['termo','duo','quatro'])nav.getElementById(m).addEventListener('click',e=>{e.preventDefault();selectMode(m);});
 nav.getElementById('about').addEventListener('click',e=>{e.preventDefault();about();});
 const hdr=header.shadowRoot;
 hdr.getElementById('bar').addEventListener('click',()=>{settings.nav=!settings.nav;bar.classList.toggle('show',settings.nav);hdr.getElementById('bar').classList.toggle('rotate',settings.nav);saveSettings();requestAnimationFrame(resizeBoards);});
 hdr.getElementById('help').addEventListener('click',help);
 hdr.getElementById('stats').addEventListener('click',statsPanel);
 hdr.getElementById('config').addEventListener('click',settingsPanel);
 keyboard.shadowRoot.addEventListener('click',e=>{const btn=e.target.closest('button');if(btn?.id?.startsWith('kbd_'))handleKey(btn.id.substring(4).toUpperCase());});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&modal.getAttribute('aria-hidden')==='false'){closeModal();return;}
  if(modal.getAttribute('aria-hidden')==='false'||e.ctrlKey||e.altKey||e.metaKey||e.repeat&&locked)return;
  if(e.key===' '||e.key==='Spacebar'||e.code==='Space'){e.preventDefault();if(!e.repeat)handleKey('SPACE');return;}
  if(e.key==='ArrowLeft'&&game&&!game.finished){game.cursor=Math.max(0,game.cursor-1);renderEditable();e.preventDefault();return;}
  if(e.key==='ArrowRight'&&game&&!game.finished){game.cursor=Math.min(5,game.cursor+1);renderEditable();e.preventDefault();return;}
  if(e.key==='Enter'){handleKey('ENTER');e.preventDefault();}
  else if(e.key==='Backspace'){handleKey('BACKSPACE');e.preventDefault();}
  else if(e.key.length===1&&/^[a-zA-Záàâãéêíóôõúüç]$/iu.test(e.key)){handleKey(e.key);e.preventDefault();}
 });
 modal.shadowRoot?.getElementById('all').addEventListener('click',e=>{if(e.target.id==='all')closeModal();});
 modal.addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;
 switch(btn.dataset.action){case 'close':closeModal();break;case 'new':newGame();break;case 'stats':statsPanel();break;case 'share':share();break;case 'reset-stats':if(confirm('Excluir todas as estatísticas deste modo?')){persist(`${STORAGE}:stats:${mode}`,{played:0,wins:0,streak:0,best:0,hist:{}});notify('Estatísticas zeradas');settingsPanel();}break;}
 });
 modal.addEventListener('change',e=>{if(e.target.id==='high-toggle'){settings.high=e.target.checked;document.body.classList.toggle('high',settings.high);saveSettings();}
 if(e.target.id==='nav-toggle'){settings.nav=e.target.checked;bar.classList.toggle('show',settings.nav);hdr.getElementById('bar').classList.toggle('rotate',settings.nav);saveSettings();requestAnimationFrame(resizeBoards);}});
 window.addEventListener('resize',resizeBoards);
 if('ResizeObserver' in globalThis)new ResizeObserver(resizeBoards).observe(boardContainer);
}
async function boot(){document.body.classList.toggle('high',!!settings.high);bar.classList.toggle('show',settings.nav);
 header.shadowRoot.getElementById('bar').classList.toggle('rotate',settings.nav);wire();
 try{await loadCorpus();}catch(err){
  console.error('Erro ao carregar banco gerado pelo Python:',err);
  openModal('<h2>Banco não disponível</h2><p>Não foi possível carregar <code>data/dictionary.json</code>.</p><p>Abra <code>termo-abrir-direto.html</code> para jogar sem servidor, ou inicie <code>python -m http.server 8000</code> e acesse <code>http://localhost:8000/</code>.</p><p>É necessário um banco gerado por <code>prepare_dictionary.py</code>. Nenhuma lista incompleta será usada no lugar dele.</p><p><button data-action="close">Fechar</button></p>', 'Banco de palavras');
  return;
 }
 const desired=new URLSearchParams(location.search).get('modo')||location.hash.substring(1)||loadJSON(`${STORAGE}:active-mode`,'termo');
 selectMode(MODES[desired]?desired:'termo',false);
 if(!window.termoDesktop&&'serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(e=>console.debug('SW indisponível',e));
}
boot();
// Exportado para testes automatizados de lógica pura.
export {evaluate,NORM,MODES,parseDictionary};

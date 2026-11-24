import { parseMoney, uuid } from './core.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

(() => {
  'use strict';

  // Standalone visual concept: deliberately no Supabase, network calls or finance storage.
  const hub = document.getElementById('hub');
  const scene = document.getElementById('scene');
  const shell = document.getElementById('cardShell');
  const walletTarget = document.getElementById('walletTarget');
  const statsTarget = document.getElementById('statsTarget');
  const walletView = document.getElementById('walletView');
  const statsView = document.getElementById('statsView');
  const themeSwitch = document.getElementById('themeSwitch');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let transitioning = false;
  let currentView = null;
  let pendingTimer;

  function hoverZone(zone) {
    if (transitioning || currentView) return;
    scene.dataset.hover = zone;
  }

  walletTarget.addEventListener('pointerenter', () => hoverZone('wallet'));
  statsTarget.addEventListener('pointerenter', () => hoverZone('stats'));
  walletTarget.addEventListener('focus', () => hoverZone('wallet'));
  statsTarget.addEventListener('focus', () => hoverZone('stats'));
  shell.addEventListener('pointerleave', () => { if (!transitioning) delete scene.dataset.hover; });

  // CSS 3D hit-testing can target the card face instead of its buttons in
  // some browsers. Keep the same two zones clickable without altering visuals.
  const frontFace = document.querySelector('.card-front');
  function faceSideAt(clientX) {
    const bounds = frontFace.getBoundingClientRect();
    return clientX < bounds.left + bounds.width / 2 ? 'wallet' : 'stats';
  }
  frontFace.addEventListener('pointermove', event => {
    if (!event.target.closest('.card-zone')) hoverZone(faceSideAt(event.clientX));
  });
  frontFace.addEventListener('click', event => {
    if (!event.target.closest('.card-zone')) goTo(faceSideAt(event.clientX));
  });

  // Stage 3D.3.2 — Tilt & Zoom, adopted from the separate Animation Lab.
  // Only the navigation choreography changes. Real card and views stay untouched.
  const zoomDurationMs = 760;
  const viewRevealAtMs = 425;
  const viewExitMs = 360;
  let returnFocusTarget = walletTarget;
  let savedSceneRect = null;

  function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  // Make a temporary visual copy for the flight. The live card's original DOM,
  // hover styling and approved geometry never get rewritten.
  function cloneScene(rect) {
    const copy = scene.cloneNode(true);
    copy.removeAttribute('id');
    copy.removeAttribute('data-hover');
    copy.removeAttribute('data-flight');
    copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    copy.querySelectorAll('button').forEach(button => {
      button.disabled = true;
      button.setAttribute('tabindex', '-1');
    });
    copy.classList.add('fx-scene');
    Object.assign(copy.style, {
      position: 'absolute',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      visibility: 'visible'
    });
    return copy;
  }

  function playZoom(side, reverse) {
    const layer = document.createElement('div');
    layer.className = 'motion-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);

    const copy = cloneScene(savedSceneRect);
    layer.append(copy);
    const flightCard = copy.querySelector('.card-shell');
    const flightShadow = copy.querySelector('.card-shadow');
    const startingTransform = getComputedStyle(shell).transform;
    const sideSign = side === 'wallet' ? -1 : 1;
    const options = {
      duration: zoomDurationMs,
      fill: 'both',
      easing: 'cubic-bezier(.22,.72,.2,1)',
      direction: reverse ? 'reverse' : 'normal'
    };

    // Identical Tilt & Zoom keyframes to Animation Lab's 'zoom' option.
    const cardMotion = flightCard.animate([
      { transform: startingTransform, opacity: 1, offset: 0 },
      { transform: `rotateX(1deg) rotateY(${sideSign * 22}deg) rotateZ(${sideSign * 2}deg) scale(1.23)`, opacity: 1, offset: .37 },
      { transform: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(3.4)', opacity: 0, offset: 1 }
    ], options);
    const shadowMotion = flightShadow.animate([
      { opacity: .74, offset: 0 },
      { opacity: 0, offset: 1 }
    ], options);

    const ended = Promise.all([cardMotion, shadowMotion].map(a => a.finished.catch(() => {})));
    return { layer, ended };
  }

  function revealScreen(side) {
    hub.hidden = true;
    currentView = side;
    const active = side === 'wallet' ? walletView : statsView;
    active.hidden = false;
    active.dataset.motion = 'enter';
    if (side === 'wallet') document.body.classList.add('wallet-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
    return active;
  }

  async function goTo(side) {
    if (transitioning || currentView) return;
    transitioning = true;
    returnFocusTarget = side === 'wallet' ? walletTarget : statsTarget;
    walletTarget.disabled = true;
    statsTarget.disabled = true;
    delete scene.dataset.hover;
    window.scrollTo({ top: 0, behavior: 'instant' });
    savedSceneRect = scene.getBoundingClientRect();

    if (motionReduced.matches) {
      const active = revealScreen(side);
      active.dataset.motion = 'rest';
      transitioning = false;
      active.querySelector('[data-back]').focus({ preventScroll: true });
      return;
    }

    const { layer, ended } = playZoom(side, false);
    scene.style.visibility = 'hidden';
    hub.classList.add('hub-transitioning');
    await delay(viewRevealAtMs);
    const active = revealScreen(side);
    await ended;
    await delay(80);
    layer.remove();
    active.dataset.motion = 'rest';
    transitioning = false;
    active.querySelector('[data-back]').focus({ preventScroll: true });
  }

  async function goBack() {
    if (transitioning || !currentView) return;
    transitioning = true;
    const side = currentView;
    const active = side === 'wallet' ? walletView : statsView;

    if (motionReduced.matches) {
      active.hidden = true;
      delete active.dataset.motion;
      document.body.classList.remove('wallet-open');
      hub.hidden = false;
      currentView = null;
      scene.style.visibility = '';
      hub.classList.remove('hub-transitioning');
      walletTarget.disabled = false;
      statsTarget.disabled = false;
      transitioning = false;
      returnFocusTarget.focus({ preventScroll: true });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
    active.dataset.motion = 'exit';
    const { layer, ended } = playZoom(side, true);
    await delay(viewExitMs);
    active.hidden = true;
    delete active.dataset.motion;
    document.body.classList.remove('wallet-open');
    hub.hidden = false;
    currentView = null;
    // The original remains invisible until the reverse zoom has landed.
    scene.style.visibility = 'hidden';
    hub.classList.add('hub-transitioning');
    await ended;
    layer.remove();
    scene.style.visibility = '';
    hub.classList.remove('hub-transitioning');
    walletTarget.disabled = false;
    statsTarget.disabled = false;
    transitioning = false;
    returnFocusTarget.focus({ preventScroll: true });
  }

  walletTarget.addEventListener('click', () => goTo('wallet'));
  statsTarget.addEventListener('click', () => goTo('stats'));
  document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', goBack));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && currentView) goBack();
  });

  themeSwitch.addEventListener('click', () => {
    const toDark = document.documentElement.dataset.theme !== 'dark';
    if (toDark) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    moonIcon.hidden = toDark;
    sunIcon.hidden = !toDark;
    themeSwitch.setAttribute('aria-label', toDark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему');
  });

  // Stage 3D.5: real Supabase wallet + real timeline. No demo financial records.
  const $ = id => document.getElementById(id);
  const authView = $('authView');
  const authForm = $('cloudAuthForm');
  const recoveryRequestForm = $('cloudRecoveryRequestForm');
  const newPasswordForm = $('cloudNewPasswordForm');
  let authMode = 'login';
  let recoveryMode = false;
  const openDialog = $('openingDialog');
  const walletLanguage = $('walletLanguage');
  const statsLanguage = $('statsLanguage');
  const walletTheme = $('walletTheme');
  const walletThemeGlyph = $('walletThemeGlyph');
  const demoExpense = $('demoExpense');
  const demoIncome = $('demoIncome');
  const demoSubmit = $('demoSubmit');
  const demoNotice = $('demoNotice');
  const demoForm = $('demoForm');
  const descInput = $('demoDescription');
  const amountInput = $('demoAmount');
  const historyList = $('walletHistoryList');
  const historyEmpty = $('walletHistoryEmpty');
  const balanceEl = $('walletBalance');
  const incomeEl = $('walletIncome');
  const expenseEl = $('walletExpense');
  const statsMonth = $('statsMonth');
  const statsChart = $('statsChart');
  const statsTimeline = $('statsTimeline');
  const statsTotal = $('statsSpendTotal');
  const statsMeta = $('statsHistoryMeta');
  const statsEmpty = $('statsHistoryEmpty');

  const THEME_KEY = 'expense-tracker:v2:theme';
  const LANGUAGE_KEY = 'expense-tracker:v2:language';
  const LEGACY_KEYS = ['item', 'liItem', 'expense-tracker:v2:cash'];
  let language = 'uk';
  let expenseSelected = true;
  let db = null;
  let signedUser = null;
  let wallet = null;
  let transactions = [];
  let busy = false;
  let statsSelectedMonth = '';
  let statsSelectedPeriod = null;

  const copy = {
    uk: {
      returnCard:'До картки', returnCardAria:'Повернутися до 3D-картки',
      language:'Мова', subtitle:'Мій гаманець · Готівка', cloudNotice:'ЗБЕРЕЖЕНО У ХМАРІ',
      balance:'Баланс', incomeUpper:'ДОХОДИ', expenseUpper:'ВИТРАТИ', history:'Історія',
      emptyHistory:'Операцій поки немає', addHeading:'Додати транзакцію',
      expenseChoice:'− Витрата', incomeChoice:'+ Дохід', description:'Опис', amount:'Сума, ₴',
      addExpense:'Додати витрату', addIncome:'Додати дохід',
      descPlaceholder:'Наприклад, продукти', amountPlaceholder:'0,00',
      invalid:'Введіть опис і додатну суму (до двох знаків після коми).',
      saved:'Операцію збережено в хмарі.', deleted:'Операцію видалено.',
      deleteLabel:'Видалити транзакцію', deleteConfirm:(name,amount)=>`Видалити транзакцію «${name}» (${amount})?\nЦю дію не можна скасувати.`,
      deleteNotFound:'Транзакцію не видалено. Оновіть сторінку та спробуйте ще раз.', loading:'Завантаження...',
      signOut:'Вийти', account:'Особистий акаунт', authHelp:'Увійдіть, щоб відкрити свій гаманець.',
      password:'Пароль', signIn:'Увійти', signUp:'Реєстрація',
      signupConfirm:'Перевірте email для підтвердження акаунта, потім увійдіть.',
      forgotPassword:'Забули пароль?', recoverTitle:'Відновлення пароля',
      recoverHelp:'Вкажіть email акаунта — надішлемо посилання для зміни пароля.',
      recoverSend:'Надіслати лист', recoverBack:'Назад до входу',
      recoverSent:'Якщо такий акаунт існує, лист для відновлення надіслано. Перевірте пошту.',
      newPasswordTitle:'Створіть новий пароль', newPasswordHelp:'Введіть новий пароль двічі, щоб відновити доступ.',
      newPassword:'Новий пароль', confirmPassword:'Повторіть пароль', savePassword:'Зберегти пароль',
      passwordsMismatch:'Паролі не збігаються.', passwordUpdated:'Пароль змінено. Тепер увійдіть з новим паролем.',
      resetLinkInvalid:'Посилання недійсне або прострочене. Надішліть новий запит на відновлення.',
      openingHeading:'Вітаємо в Expense Tracker!',
      openingIntro:'Скільки готівки у вас зараз є? Можна почати з 0 ₴.',
      openingAmountLabel:'Початковий баланс, ₴', openingSubmit:'Почати',
      missingConfig:'Заповніть config.js (Supabase URL та publishable key).',
      cloudError:'Помилка збереження: ',
      historyTitle:'Історія', statsIntro:'Усі надходження та витрати за вибраний місяць.',
      spend:'Витрати за місяць', month:'Місяць', chart:'Динаміка витрат', periods:'4 періоди',
      historyTransactions:'Транзакції', selectedMonth:'За місяць',
      empty:'У цьому місяці ще немає операцій.', emptyPeriod:'За цей період немає операцій.',
      today:'СЬОГОДНІ', yesterday:'ВЧОРА',
      ops:n => `${n} ${n%10===1&&n%100!==11?'операція':(n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'операції':'операцій')}`
    },
    en: {
      returnCard:'Back to card', returnCardAria:'Return to 3D card',
      language:'Language', subtitle:'My wallet · Cash', cloudNotice:'SAVED IN THE CLOUD',
      balance:'Balance',incomeUpper:'INCOME',expenseUpper:'EXPENSES',history:'History',
      emptyHistory:'No transactions yet',addHeading:'Add transaction',
      expenseChoice:'− Expense',incomeChoice:'+ Income',description:'Description',amount:'Amount, ₴',
      addExpense:'Add expense',addIncome:'Add income',
      descPlaceholder:'For example, groceries',amountPlaceholder:'0.00',
      invalid:'Enter a description and positive amount (up to two decimal places).',
      saved:'Transaction saved in the cloud.',deleted:'Transaction deleted.',
      deleteLabel:'Delete transaction', deleteConfirm:(name,amount)=>`Delete “${name}” (${amount})?\nThis action cannot be undone.`,
      deleteNotFound:'Transaction was not deleted. Refresh the page and try again.',loading:'Loading...',
      signOut:'Sign out',account:'Personal account',authHelp:'Sign in to open your wallet.',
      password:'Password',signIn:'Sign in',signUp:'Sign up',
      signupConfirm:'Confirm your account using the email link, then sign in.',
      forgotPassword:'Forgot password?', recoverTitle:'Reset password',
      recoverHelp:'Enter the account email and we will send you a password reset link.',
      recoverSend:'Send reset email', recoverBack:'Back to sign in',
      recoverSent:'If an account exists for this email, a reset email has been sent. Check your inbox.',
      newPasswordTitle:'Set a new password', newPasswordHelp:'Enter the new password twice to restore access.',
      newPassword:'New password', confirmPassword:'Confirm password', savePassword:'Save password',
      passwordsMismatch:'Passwords do not match.', passwordUpdated:'Password changed. Sign in with your new password.',
      resetLinkInvalid:'This link is invalid or expired. Request a new password reset email.',
      openingHeading:'Welcome to Expense Tracker!',
      openingIntro:'How much cash do you have right now? You may start at ₴0.',
      openingAmountLabel:'Opening balance, ₴',openingSubmit:'Get started',
      missingConfig:'Fill in config.js (Supabase URL and publishable key).',
      cloudError:'Cloud storage error: ',
      historyTitle:'History',statsIntro:'All income and expenses for the selected month.',
      spend:'Expenses this month',month:'Month',chart:'Expense activity',periods:'4 periods',
      historyTransactions:'Transactions',selectedMonth:'This month',
      empty:'No transactions this month.',emptyPeriod:'No transactions in this period.',
      today:'TODAY',yesterday:'YESTERDAY',
      ops:n=>`${n} ${n===1?'transaction':'transactions'}`
    }
  };
  const t = key => copy[language][key];
  const locale = () => language==='uk'?'uk-UA':'en-GB';
  const formatMoney = cents => `${new Intl.NumberFormat(locale(),{minimumFractionDigits:cents%100===0?0:2,maximumFractionDigits:2}).format(cents/100)} ₴`;
  const formatAmount = (cents,type) => `${type==='income'?'+':'−'}${formatMoney(cents)}`;
  const sorted = () => [...transactions].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  let statusDismissTimer = null;
  let statusHideTimer = null;
  function message(str='',isError=false) {
    // Cancel both timers so an earlier message cannot hide a newer one.
    if (statusDismissTimer !== null) {
      window.clearTimeout(statusDismissTimer);
      statusDismissTimer = null;
    }
    if (statusHideTimer !== null) {
      window.clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }
    const global=$('cloudStatus');
    if (!str) {
      global.hidden=true;
      global.textContent='';
      global.classList.remove('is-error','is-visible','is-leaving');
      return;
    }
    global.textContent=str;
    global.classList.toggle('is-error',isError);
    global.classList.remove('is-leaving');
    global.hidden=false;
    // Restart entrance when a new toast replaces the previous one.
    global.classList.remove('is-visible');
    void global.offsetWidth;
    global.classList.add('is-visible');
    // Leave progress notifications visible until the operation finishes.
    if (str !== t('loading')) {
      statusDismissTimer = window.setTimeout(() => {
        statusDismissTimer=null;
        global.classList.remove('is-visible');
        global.classList.add('is-leaving');
        statusHideTimer = window.setTimeout(() => {
          if (global.classList.contains('is-leaving')) {
            global.hidden=true;
            global.textContent='';
            global.classList.remove('is-error','is-leaving');
          }
          statusHideTimer=null;
        }, 240);
      }, isError ? 6000 : 3000);
    }
  }
  function setAuthMode(mode) {
    authMode=mode;
    authForm.hidden=mode!=='login';
    $('cloudForgotPassword').hidden=mode!=='login';
    recoveryRequestForm.hidden=mode!=='request';
    newPasswordForm.hidden=mode!=='new';
    const headingKey=mode==='request'?'recoverTitle':mode==='new'?'newPasswordTitle':'account';
    const helpKey=mode==='request'?'recoverHelp':mode==='new'?'newPasswordHelp':'authHelp';
    $('authHeading').textContent=t(headingKey);
    $('authHelp').textContent=t(helpKey);
  }
  // Tokens in recovery URLs must not linger in browser history after processing.
  function cleanAuthRedirect() {
    window.history.replaceState(null,document.title,window.location.pathname);
  }
  function hasExpiredAuthLink() {
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
    const query=new URLSearchParams(window.location.search);
    return !!(hash.get('error')||hash.get('error_code')||query.get('error')||query.get('error_code'));
  }
  function isRecoveryRedirect() {
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
    const query=new URLSearchParams(window.location.search);
    return hash.get('type')==='recovery'||query.get('type')==='recovery';
  }
  function showRecoveryRequest(withError=false) {
    switchToSignedOut();
    recoveryMode=false;
    setAuthMode('request');
    $('cloudRecoveryEmail').value=$('cloudEmail').value.trim()||$('cloudRecoveryEmail').value;
    if(withError)message(t('resetLinkInvalid'),true);
    $('cloudRecoveryEmail').focus({preventScroll:true});
  }
  function showNewPasswordForm() {
    switchToSignedOut(); // Hide finances; keep the Supabase recovery session intact.
    recoveryMode=true;
    setAuthMode('new');
    cleanAuthRedirect(); // Session is already accepted by Supabase; remove link tokens.
    message('');
    $('cloudNewPassword').focus({preventScroll:true});
  }

  function setBusy(flag) {
    busy=flag;
    ['cloudSignIn','cloudSignUp','cloudSignOut','openingSubmit','demoSubmit','cloudForgotPassword','cloudRecoverySend','cloudRecoveryCancel','cloudPasswordSave'].forEach(id=>{ $(id).disabled=flag; });
  }
  function setType(expense) {
    expenseSelected=expense;
    demoExpense.classList.toggle('active',expense);
    demoIncome.classList.toggle('active',!expense);
    demoExpense.setAttribute('aria-pressed',String(expense));
    demoIncome.setAttribute('aria-pressed',String(!expense));
    demoSubmit.textContent=t(expense?'addExpense':'addIncome');
  }
  function updateThemeGlyph() {
    const isDark = document.documentElement.dataset.theme==='dark';
    walletThemeGlyph.textContent = isDark?'☀':'☾';
    walletTheme.setAttribute('aria-label', isDark?'Light theme':'Dark theme');
  }
  themeSwitch.addEventListener('click',()=>{
    updateThemeGlyph();
    try { localStorage.setItem(THEME_KEY,document.documentElement.dataset.theme==='dark'?'dark':'light'); } catch {}
  });
  walletTheme.addEventListener('click',()=>themeSwitch.click());
  function chooseLanguage(lang) {
    language = lang==='en'?'en':'uk';
    document.documentElement.lang=language;
    walletLanguage.value=language;
    statsLanguage.value=language;
    walletView.lang=language;
    statsView.lang=language;
    walletView.querySelectorAll('[data-wallet-i18n]').forEach(el=>{
      const key=el.dataset.walletI18n;
      if (key in copy[language]) el.textContent=t(key);
    });
    descInput.placeholder=t('descPlaceholder');
    amountInput.placeholder=t('amountPlaceholder');
    walletView.querySelector('[data-wallet-back]').setAttribute('aria-label',t('returnCardAria'));
    $('cloudSignOut').textContent=t('signOut');
    $('cloudPasswordLabel').textContent=t('password');
    $('cloudSignIn').textContent=t('signIn');
    $('cloudSignUp').textContent=t('signUp');
    $('cloudForgotPassword').textContent=t('forgotPassword');
    $('cloudRecoveryEmailLabel').textContent='Email';
    $('cloudRecoverySend').textContent=t('recoverSend');
    $('cloudRecoveryCancel').textContent=t('recoverBack');
    $('cloudNewPasswordLabel').textContent=t('newPassword');
    $('cloudConfirmPasswordLabel').textContent=t('confirmPassword');
    $('cloudPasswordSave').textContent=t('savePassword');
    setAuthMode(authMode);
    $('openingHeading').textContent=t('openingHeading');
    $('openingIntro').textContent=t('openingIntro');
    $('openingAmountLabel').textContent=t('openingAmountLabel');
    $('openingSubmit').textContent=t('openingSubmit');
    $('statsDemoNotice').textContent=t('cloudNotice');
    $('walletView').querySelector('.wallet-demo-disclaimer').textContent=t('cloudNotice');
    setType(expenseSelected);
    renderWallet();
    renderStats();
    try {localStorage.setItem(LANGUAGE_KEY,language);}catch{}
  }

  async function fetchTransactions(userId) {
    const result=[];
    for (let offset=0;offset<200000;offset+=500) {
      const {data,error}=await db.from('cash_transactions')
        .select('id,type,description,amount_cents,created_at')
        .eq('user_id',userId)
        .order('created_at',{ascending:false}).order('id',{ascending:false})
        .range(offset,offset+499);
      if(error) throw error;
      result.push(...data);
      if(data.length<500) return result;
    }
    throw new Error('Too many transactions to load safely.');
  }
  function validateCloudRecords(w,items) {
    if(!Number.isSafeInteger(w.opening_balance_cents))throw new Error('Invalid opening balance');
    let total=w.opening_balance_cents;
    for(const tx of items) {
      if(!Number.isSafeInteger(tx.amount_cents)||tx.amount_cents<=0||!['income','expense'].includes(tx.type))throw new Error('Invalid transaction amount');
      total+=tx.type==='income'?tx.amount_cents:-tx.amount_cents;
      if(!Number.isSafeInteger(total))throw new Error('Amount exceeds the safe numeric range');
    }
  }
  function switchToSignedOut() {
    signedUser=null;wallet=null;transactions=[];
    setAuthMode('login');
    authView.hidden=false;
    $('cloudUser').hidden=true;
    hub.hidden=true;walletView.hidden=true;statsView.hidden=true;
    if(openDialog.open)openDialog.close();
    scene.style.visibility='';hub.classList.remove('hub-transitioning');
    currentView=null;transitioning=false;
  }
  function clearOldLocalData() {
    try {LEGACY_KEYS.forEach(key=>localStorage.removeItem(key));}catch{}
  }
  async function loadAccount(user) {
    if(!user){switchToSignedOut();return;}
    signedUser=user;
    setBusy(true);
    message(t('loading'));
    try {
      const {data,error}=await db.from('cash_wallets')
        .select('user_id,opening_balance_cents').eq('user_id',user.id).maybeSingle();
      if(error)throw error;
      wallet=data;
      if(!wallet) {
        authView.hidden=true;
        $('cloudUser').hidden=false;
        $('cloudUserEmail').textContent=user.email||'';
        hub.hidden=true;
        $('openingAmount').value='';$('openingError').textContent='';
        if(!openDialog.open)openDialog.showModal();
        message('');
        return;
      }
      const incoming=await fetchTransactions(user.id);
      validateCloudRecords(wallet,incoming);
      transactions=incoming;
      authView.hidden=true;
      $('cloudUser').hidden=false;
      $('cloudUserEmail').textContent=user.email||'';
      hub.hidden=false;
      clearOldLocalData();
      renderWallet();renderStats();message('');
    } catch(err) {
      message(t('cloudError')+err.message,true);
      authView.hidden=false;
      hub.hidden=true;
    } finally {setBusy(false);}
  }
  // Recovery email must redirect to this exact page (not Supabase's default localhost:3000).
  $('cloudForgotPassword').addEventListener('click',()=>{
    if(busy)return;
    $('cloudPassword').value='';
    showRecoveryRequest();message('');
  });
  $('cloudRecoveryCancel').addEventListener('click',()=>{
    if(busy)return;
    setAuthMode('login');message('');
  });
  recoveryRequestForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!db||!recoveryRequestForm.reportValidity())return;
    const email=$('cloudRecoveryEmail').value.trim();
    setBusy(true);message(t('loading'));
    try {
      const redirectTo=window.location.origin+window.location.pathname;
      const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
      if(error)throw error;
      message(t('recoverSent'));
    } catch(err) { message(t('cloudError')+err.message,true); }
    finally {setBusy(false);}
  });
  newPasswordForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!db||!recoveryMode||!newPasswordForm.reportValidity())return;
    const password=$('cloudNewPassword').value;
    if(password!==$('cloudConfirmPassword').value){message(t('passwordsMismatch'),true);return;}
    setBusy(true);message(t('loading'));
    try {
      const {error}=await db.auth.updateUser({password});
      if(error)throw error;
      // The successful update is complete even if sign-out later fails.
      newPasswordForm.reset();
      cleanAuthRedirect();
      recoveryMode=false;
      try {await db.auth.signOut();}catch{};
      switchToSignedOut();
      message(t('passwordUpdated'));
      $('cloudPassword').value='';
    } catch(err) {message(t('cloudError')+err.message,true);}
    finally {setBusy(false);}
  });

  async function authAction(signUp=false) {
    if(busy||!db||authMode!=='login')return;
    if(!authForm.reportValidity())return;
    const email=$('cloudEmail').value.trim();
    const password=$('cloudPassword').value;
    if(password.length<6)return;
    setBusy(true);message(t('loading'));
    try {
      const {data,error}=signUp
        ?await db.auth.signUp({email,password})
        :await db.auth.signInWithPassword({email,password});
      if(error)throw error;
      if(signUp&&!data.session){message(t('signupConfirm'));return;}
      if(!data.user)throw new Error('No authenticated user returned.');
      await loadAccount(data.user);
    }catch(err){message(t('cloudError')+err.message,true);}
    finally{setBusy(false);}
  }
  authForm.addEventListener('submit',event=>{event.preventDefault();authAction(false);});
  $('cloudSignUp').addEventListener('click',()=>authAction(true));
  $('cloudSignOut').addEventListener('click',async()=>{
    if(!db||busy)return;
    setBusy(true);
    try{
      const {error}=await db.auth.signOut();if(error)throw error;
      switchToSignedOut();message('');
    }catch(err){message(t('cloudError')+err.message,true);}
    finally{setBusy(false);}
  });

  function parseOpening(raw) {
    const value=String(raw).trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
    if(/^0+(?:\.0{1,2})?$/.test(value))return 0;
    return parseMoney(value);
  }
  $('openingForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!signedUser||!db)return;
    let cents;
    try{cents=parseOpening($('openingAmount').value);if(cents>9000000000000)throw new Error('Too large');}
    catch { $('openingError').textContent=t('invalid');return; }
    setBusy(true);$('openingError').textContent='';
    try {
      const {error}=await db.from('cash_wallets').insert({user_id:signedUser.id,opening_balance_cents:cents});
      if(error)throw error;
      openDialog.close();
      await loadAccount(signedUser);
    }catch(err){$('openingError').textContent=t('cloudError')+err.message;}
    finally{setBusy(false);}
  });
  openDialog.addEventListener('cancel',event=>event.preventDefault());
  demoExpense.addEventListener('click',()=>setType(true));
  demoIncome.addEventListener('click',()=>setType(false));
  demoForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!db||!signedUser||!wallet)return;
    const description=descInput.value.trim();
    let cents;
    try{cents=parseMoney(amountInput.value);if(cents>9000000000000)throw new Error('Too large');}
    catch{demoNotice.textContent=t('invalid');demoNotice.classList.add('is-error');return;}
    if(!description||description.length>160){demoNotice.textContent=t('invalid');demoNotice.classList.add('is-error');return;}
    setBusy(true);message(t('loading'));
    try{
      const {error}=await db.from('cash_transactions').insert({
        id:uuid(),user_id:signedUser.id,type:expenseSelected?'expense':'income',
        description,amount_cents:cents
      });
      if(error)throw error;
      transactions=await fetchTransactions(signedUser.id);
      validateCloudRecords(wallet,transactions);
      demoForm.reset();setType(true);
      demoNotice.classList.remove('is-error');demoNotice.textContent=t('saved');
      renderWallet();renderStats();message('');
    }catch(err){message(t('cloudError')+err.message,true);}
    finally{setBusy(false);}
  });

  function renderWallet() {
    if(!wallet)return;
    let inc=0,exp=0;
    for(const tx of transactions){if(tx.type==='income')inc+=tx.amount_cents;else exp+=tx.amount_cents;}
    balanceEl.textContent=formatMoney(wallet.opening_balance_cents+inc-exp);
    incomeEl.textContent='+'+formatMoney(inc);
    expenseEl.textContent='−'+formatMoney(exp);
    const list=sorted();
    historyList.replaceChildren();
    historyEmpty.hidden=list.length>0;
    historyList.setAttribute('aria-label',language==='uk'?'П’ять останніх операцій':'Five most recent transactions');
    list.slice(0,5).forEach(tx=>{
      const li=document.createElement('li');
      if(tx.type==='income')li.classList.add('income');
      const name=document.createElement('span');name.className='wallet-tx-label';name.textContent=tx.description;
      const value=document.createElement('span');value.className='wallet-tx-amount';value.textContent=formatAmount(tx.amount_cents,tx.type);
      li.append(name,value);historyList.append(li);
    });
  }

  const today=new Date();
  const monthKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const dayKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function localMonthOptions() {
    const baseline=transactions.length ? sorted().at(-1).created_at : new Date().toISOString();
    const earliest=new Date(baseline);
    const start=new Date(earliest.getFullYear(),earliest.getMonth(),1);
    const end=new Date(today.getFullYear(),today.getMonth(),1);
    const months=[];
    for(let month=new Date(end);month>=start && months.length<240;month.setMonth(month.getMonth()-1))months.push(new Date(month));
    return months;
  }
  function makeEl(tag,cls,value) {
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=value;
    return el;
  }
  function getPeriods(month) {
    const end=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    return [{from:1,to:7},{from:8,to:14},{from:15,to:21},{from:22,to:end}];
  }
  function dateHeading(date) {
    const f=new Intl.DateTimeFormat(locale(),{day:'numeric',month:'long'}).format(date);
    if(dayKey(date)===dayKey(new Date()))return `${t('today')} · ${f}`;
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
    if(dayKey(date)===dayKey(yesterday))return `${t('yesterday')} · ${f}`;
    return new Intl.DateTimeFormat(locale(),{day:'numeric',month:'long',year:'numeric'}).format(date).toUpperCase();
  }
  function renderStats() {
    if(!wallet)return;
    const labels={
      statsHeadingText:t('historyTitle'),statsBackText:t('returnCard'),statsIntro:t('statsIntro'),
      statsDemoNotice:t('cloudNotice'),statsSpendLabel:t('spend'),statsChartHeading:t('chart'),
      statsChartSubheading:t('periods'),statsHistoryTitle:t('historyTransactions'),
      statsHistoryEmpty:t('empty'),statsLanguageLabel:t('language'),statsMonthLabel:t('month')
    };
    Object.entries(labels).forEach(([id,value])=>$(id).textContent=value);
    $('statsBack').setAttribute('aria-label',t('returnCardAria'));
    const months=localMonthOptions();
    const options=months.map(m=>monthKey(m));
    if(!options.includes(statsSelectedMonth))statsSelectedMonth=options[0]||monthKey(new Date());
    statsMonth.replaceChildren();
    months.forEach(m=>{
      const txt=new Intl.DateTimeFormat(locale(),{month:'long',year:'numeric'}).format(m);
      statsMonth.add(new Option(txt.charAt(0).toUpperCase()+txt.slice(1),monthKey(m)));
    });
    statsMonth.value=statsSelectedMonth;
    const monthly=sorted().map(x=>({...x,at:new Date(x.created_at)}))
      .filter(x=>monthKey(x.at)===statsSelectedMonth);
    statsTotal.textContent=formatMoney(monthly.reduce((s,tx)=>s+(tx.type==='expense'?tx.amount_cents:0),0));
    const [yr,mo]=statsSelectedMonth.split('-').map(Number);
    const monthDate=new Date(yr,mo-1,1);
    const periods=getPeriods(monthDate);
    const range=statsSelectedPeriod===null?null:periods[statsSelectedPeriod];
    const visible=range?monthly.filter(tx=>tx.at.getDate()>=range.from&&tx.at.getDate()<=range.to):monthly;
    statsMeta.textContent=range?`${t('ops')(visible.length)} · ${range.from}–${range.to}`:
      `${t('ops')(monthly.length)} · ${t('selectedMonth').toLowerCase()}`;
    statsEmpty.textContent=range?t('emptyPeriod'):t('empty');statsEmpty.hidden=visible.length>0;
    statsChart.replaceChildren();statsChart.style.setProperty('--week-count','4');
    statsChart.setAttribute('aria-label',t('chart'));
    const totals=periods.map(p=>monthly.reduce((sum,tx)=>sum+(tx.type==='expense'&&tx.at.getDate()>=p.from&&tx.at.getDate()<=p.to?tx.amount_cents:0),0));
    const maximum=Math.max(1,...totals);
    const maxIndex=totals.indexOf(maximum);
    periods.forEach((p,index)=>{
      const col=makeEl('div','stats-week');col.setAttribute('role','button');col.tabIndex=0;
      col.setAttribute('aria-pressed',String(statsSelectedPeriod===index));
      const monthLabel=new Intl.DateTimeFormat(locale(),{month:'long',year:'numeric'}).format(monthDate);
      const tooltip=`${p.from}–${p.to} ${monthLabel} · ${t('chart')}: ${formatMoney(totals[index])}`;
      col.title=tooltip;col.setAttribute('aria-label',tooltip);
      const changePeriod=()=>{
        statsSelectedPeriod=statsSelectedPeriod===index?null:index;
        renderStats();statsChart.children[index]?.focus({preventScroll:true});
      };
      col.addEventListener('click',changePeriod);
      col.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();changePeriod();}
      });
      const value=makeEl('span','stats-week-value',totals[index]?formatMoney(totals[index]):'0');
      const track=makeEl('span','stats-week-track');
      const bar=makeEl('span',`stats-week-bar${index===maxIndex?' is-max':''}`);
      bar.style.height=totals[index]===0?'0%':`${Math.max(5,Math.round(totals[index]/maximum*100))}%`;
      track.append(bar);
      col.append(value,track,makeEl('span','stats-week-label',`${p.from}–${p.to}`));
      statsChart.append(col);
    });
    statsTimeline.replaceChildren();
    let prev='';let group;
    const counts=new Map();
    visible.forEach(tx=>{const key=dayKey(tx.at);counts.set(key,(counts.get(key)||0)+1);});
    visible.forEach(tx=>{
      const day=dayKey(tx.at);
      if(day!==prev){
        prev=day;group=makeEl('section','stats-day-group');
        const header=makeEl('div','stats-day-heading');
        header.append(makeEl('h4','stats-day-label',dateHeading(tx.at)));
        header.append(makeEl('span','stats-day-count',t('ops')(counts.get(day))));
        group.append(header);statsTimeline.append(group);
      }
      const entry=makeEl('div','stats-entry');
      const main=makeEl('div','stats-entry-main');
      main.append(makeEl('span','stats-entry-name',tx.description));
      const time=makeEl('time','stats-entry-time',new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit',hour12:false}).format(tx.at));
      time.dateTime=tx.created_at;main.append(time);
      entry.append(main,makeEl('strong',`stats-entry-amount${tx.type==='income'?' is-income':''}`,formatAmount(tx.amount_cents,tx.type)));
      const remove=makeEl('button','stats-entry-delete');
      remove.type='button';
      remove.dataset.transactionId=tx.id;
      remove.setAttribute('aria-label',`${t('deleteLabel')}: ${tx.description}, ${formatAmount(tx.amount_cents,tx.type)}`);
      remove.title=t('deleteLabel');
      remove.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';
      entry.append(remove);
      group.append(entry);
    });
  }
  // Deletion is available only in the full Back UI history. Supabase RLS also
  // enforces the ownership check server-side; never delete by ID alone.
  statsTimeline.addEventListener('click',async event=>{
    const remove=event.target.closest('button.stats-entry-delete');
    if(!remove||!statsTimeline.contains(remove)||busy||!db||!wallet||!signedUser)return;
    const tx=transactions.find(item=>item.id===remove.dataset.transactionId);
    if(!tx)return;
    if(!window.confirm(t('deleteConfirm')(tx.description,formatAmount(tx.amount_cents,tx.type))))return;
    setBusy(true);
    remove.disabled=true;
    message(t('loading'));
    try {
      const {data,error}=await db.from('cash_transactions').delete()
        .eq('id',tx.id).eq('user_id',signedUser.id).select('id');
      if(error)throw error;
      if(!Array.isArray(data)||data.length!==1||data[0].id!==tx.id)throw new Error(t('deleteNotFound'));
      const remaining=transactions.filter(item=>item.id!==tx.id);
      validateCloudRecords(wallet,remaining);
      transactions=remaining;
      renderWallet();
      renderStats();
      message(t('deleted'));
    } catch(err) {
      message(t('cloudError')+err.message,true);
    } finally {
      setBusy(false);
      // The button may have been replaced by a fresh render after success.
      if(remove.isConnected)remove.disabled=false;
    }
  });
  statsMonth.addEventListener('change',()=>{statsSelectedMonth=statsMonth.value;statsSelectedPeriod=null;renderStats();});
  statsLanguage.addEventListener('change',()=>chooseLanguage(statsLanguage.value));
  walletLanguage.addEventListener('change',()=>chooseLanguage(walletLanguage.value));

  async function initCloud() {
    const previousTheme=localStorage.getItem(THEME_KEY);
    if(previousTheme==='dark' && document.documentElement.dataset.theme!=='dark')themeSwitch.click();
    chooseLanguage(localStorage.getItem(LANGUAGE_KEY)||'uk');
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL)||
      !SUPABASE_PUBLISHABLE_KEY||SUPABASE_PUBLISHABLE_KEY.startsWith('PASTE_')){
      message(t('missingConfig'),true);return;
    }
    if(!window.supabase?.createClient){message('Supabase library did not load. Check your internet.',true);return;}
    try {
      db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
      // Register before getSession(): Supabase emits PASSWORD_RECOVERY on reset links.
      db.auth.onAuthStateChange((event,session)=>{
        if(event==='PASSWORD_RECOVERY'&&session){
          recoveryMode=true;
          // Schedule UI changes outside the synchronous auth callback.
          window.setTimeout(()=>showNewPasswordForm(),0);
        }
      });
      if(hasExpiredAuthLink()){
        showRecoveryRequest(true);
        cleanAuthRedirect();
        return;
      }
      const {data:{session},error}=await db.auth.getSession();
      if(error)throw error;
      if(recoveryMode||isRecoveryRedirect()){
        if(session)showNewPasswordForm();
        else {showRecoveryRequest(true);cleanAuthRedirect();}
        return;
      }
      if(!session){switchToSignedOut();return;}
      const {data:{user},error:userError}=await db.auth.getUser();
      if(userError)throw userError;
      if(recoveryMode)return;
      await loadAccount(user);
    }catch(err){
      if(recoveryMode||isRecoveryRedirect()){
        showRecoveryRequest(true);
        cleanAuthRedirect();
      }else{
        switchToSignedOut();
        message(t('cloudError')+err.message,true);
      }
    }
  }
  initCloud();
  window.addEventListener('pagehide',()=>window.clearTimeout(pendingTimer));
})();

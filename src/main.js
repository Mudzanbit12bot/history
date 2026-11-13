import { modules, gameTitles } from "./data.js";
import { quizGames } from "./quiz-games.js";

const KEY = "history2077-v1";
const QUIZ_KEY = "history2077-quiz-game-v1";
const LIVE_KEY = "history2077-live-classroom-v1";
const root = document.querySelector("#app");
const navItems = [
  ["home", "Обзор", "◈"],
  ["archive", "Архив", "▤"],
  ["games", "Game Center", "⌁"],
  ["quiz-games", "Командные викторины", "⚑"],
  ["tests", "Тестирование", "✓"],
  ["crossword", "Кроссворды", "▦"],
  ["classroom", "Live Classroom", "◎"],
  ["results", "Результаты", "↗"],
  ["about", "Об авторе", "◉"],
  ["settings", "Настройки", "⚙"]
];
const state = {
  page: "home",
  moduleId: modules[0].id,
  tier: 1,
  gameId: null,
  gameStep: 0,
  gameScore: 0,
  gameOrder: [],
  gameAnswers: {},
  quizAnswers: {},
  quizQuestionSet: null,
  quizSetKey: "",
  quizVariant: "",
  crosswordChecked: false,
  classroom: null,
  teacher: null,
  joinCode: new URLSearchParams(location.search).get("join") || "",
  joining: false
};
let classroomUnsubscribe = null;
let classroomSubscriptionKey = "";

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { attempts: [], completed: [], favorites: [], nickname: "" };
  } catch {
    return { attempts: [], completed: [], favorites: [], nickname: "" };
  }
}
let progress = readProgress();
function readQuizProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUIZ_KEY));
    if (saved && saved.games && quizGames.some((game) => game.id === saved.selectedGameId)) return saved;
  } catch { }
  return { selectedGameId: quizGames[0].id, games: {} };
}
let quizProgress = readQuizProgress();
function saveQuizProgress() {
  localStorage.setItem(QUIZ_KEY, JSON.stringify(quizProgress));
}
function quizBoardState(gameId) {
  if (!quizProgress.games[gameId]) {
    quizProgress.games[gameId] = {
      teams: [
        { id: "team-1", name: "Команда 1", score: 0 },
        { id: "team-2", name: "Команда 2", score: 0 }
      ],
      completedQuestions: [],
      activeQuestionId: "",
      answerRevealed: false,
      history: []
    };
  }
  return quizProgress.games[gameId];
}
function clearAllData() {
  if (!confirm("Очистить локальный прогресс, результаты тестов, команды и их баллы?")) return;
  if (!confirm("Подтвердите ещё раз: локальные данные будут удалены. Файлы сайта и облачные занятия с ответами Firebase не затрагиваются.")) return;
  stopClassroomWatch();
  localStorage.removeItem(KEY);
  localStorage.removeItem(QUIZ_KEY);
  localStorage.removeItem(LIVE_KEY);
  progress = { attempts: [], completed: [], favorites: [], nickname: "" };
  quizProgress = { selectedGameId: quizGames[0].id, games: {} };
  state.classroom = null;
  state.quizQuestionSet = null;
  state.joinCode = "";
  state.joining = false;
  if (location.search) history.replaceState({}, "", location.pathname);
  render();
  toast("Локальные данные очищены. Файлы сайта не удалены.");
}
function saveProgress() {
  localStorage.setItem(KEY, JSON.stringify(progress));
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function normalize(value = "") {
  return String(value).trim().toLowerCase().replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/gi, "");
}
function currentModule() {
  return modules.find((item) => item.id === state.moduleId) || modules[0];
}
function setPage(page, options = {}) {
  if (state.page === "classroom" && page !== "classroom") stopClassroomWatch();
  state.page = page;
  if (options.moduleId) state.moduleId = options.moduleId;
  if (options.tier) state.tier = options.tier;
  state.gameId = options.gameId || null;
  state.gameStep = 0;
  state.gameScore = 0;
  state.gameOrder = [];
  state.gameAnswers = {};
  state.quizAnswers = {};
  state.quizQuestionSet = null;
  state.quizSetKey = "";
  state.quizVariant = "";
  state.crosswordChecked = false;
  render();
  if (page === "classroom") {
    if (state.classroom) watchCurrentClassroom();
    else if (!state.joining) resumeStoredClassroom();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function shell(content) {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#" data-page="home" aria-label="HISTORY 2077, главная"><span class="brand-glyph">H://</span><span class="brand-name">HISTORY<span>://2077</span></span></a>
        <div class="sidebar-label">АРХИВНАЯ СИСТЕМА</div>
        <nav class="side-nav">${navItems.map(([id, label, icon]) => `<button class="nav-item ${state.page === id ? "active" : ""}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span>${id === "classroom" ? '<span class="nav-tag">LIVE</span>' : ""}</button>`).join("")}</nav>
        <div class="sidebar-bottom"><span class="online-dot"></span><span>АРХИВ ДОСТУПЕН</span><span class="sidebar-version">v1.0</span><button class="sidebar-clear" data-action="clear-all-data">ОЧИСТИТЬ ДАННЫЕ</button></div>
      </aside>
      <main class="main-area">
        <header class="topbar"><button class="mobile-menu" data-action="toggle-menu" aria-label="Открыть меню">☰</button><div class="breadcrumb">HISTORY://2077 <span>/</span> <b>${escapeHtml(navItems.find(([id]) => id === state.page)?.[1] || "Архив")}</b></div><div class="topbar-right"><span class="sync-status"><i></i> ${state.page === "classroom" ? "FIREBASE REALTIME" : "ЛОКАЛЬНЫЙ РЕЖИМ"}</span><button class="icon-button" data-page="settings" aria-label="Настройки">⚙</button><div class="avatar">${escapeHtml((progress.nickname || "И")[0].toUpperCase())}</div></div></header>
        <section class="page-content">${content}</section>
        <footer class="footer"><span>HISTORY://2077</span><span>Автор проекта: Рябчук Иван Андреевич</span><span>Учебный проект · факты сопровождаются источниками и оговорками</span></footer>
      </main>
    </div>
    <div class="toast-region" aria-live="polite"></div>`;
  if (state.joinCode && !state.joining) {
    state.joining = true;
    state.page = "classroom";
    render();
    return;
  }
}
function pageHeading(eyebrow, title, text, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${text}</p></div>${action}</div>`;
}
function homePage() {
  const done = progress.completed.length;
  const attempts = progress.attempts.length;
  const last = progress.attempts[0];
  const progressPct = Math.round(done / modules.length * 100);
  return `
    <div class="hero-grid">
      <section class="hero-panel">
        <div class="hero-kicker"><span class="pulse"></span> DIGITAL HISTORY ARCHIVE <span class="hero-sep">/</span> 2077</div>
        <h1>ВОССТАНОВЛЕНИЕ<br /><span>ИСТОРИИ</span></h1>
        <p>Архив повреждён. Исследуйте историю Руси, проверяйте свидетельства и возвращайте знания в систему.</p>
        <p class="hero-author"><strong>АВТОР ПРОЕКТА</strong> Рябчук Иван Андреевич</p>
        <div class="hero-actions"><button class="button button-primary" data-page="archive">ОТКРЫТЬ АРХИВ <span>↗</span></button><button class="button button-quiet" data-page="games">НАЧАТЬ ИССЛЕДОВАНИЕ</button></div>
        <div class="hero-status"><span>СОДЕРЖАНИЕ ПРОВЕРЕНО</span><span class="mono">6 УЧЕБНЫХ МОДУЛЕЙ</span><span>ИСТОЧНИКИ УКАЗАНЫ</span></div>
      </section>
      <aside class="signal-panel"><div class="panel-topline"><span>ARCHIVE SIGNAL</span><span class="mono">2077.11.13</span></div><div class="signal-visual"><div class="signal-ring ring-one"></div><div class="signal-ring ring-two"></div><div class="signal-core">H</div><div class="signal-cross cross-x"></div><div class="signal-cross cross-y"></div></div><div class="signal-caption"><span class="signal-dot"></span><span>АРХИВНЫЙ УЗЕЛ</span><strong>ONLINE</strong></div>      <div class="signal-index mono">ARCHIVE NODE / 01</div></aside>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><span>УЧЕБНЫЕ МОДУЛИ</span><strong>06</strong><small>IX — начало XVI века</small></div>
      <div class="stat-card"><span>ИГРОВЫЕ МЕХАНИКИ</span><strong>06</strong><small>Квесты, анализ, стратегия</small></div>
      <div class="stat-card"><span>ПРОЙДЕНО</span><strong>${String(done).padStart(2, "0")}<em> / 06</em></strong><small>${progressPct}% освоения архива</small></div>
      <div class="stat-card"><span>ПОПЫТКИ ТЕСТОВ</span><strong>${String(attempts).padStart(2, "0")}</strong><small>Сохранены на этом устройстве</small></div>
    </div>
    <div class="section-title"><div><div class="eyebrow">ПРОДОЛЖИТЬ ИССЛЕДОВАНИЕ</div><h2>Учебный маршрут</h2></div><button class="text-button" data-page="archive">Все модули <span>→</span></button></div>
    <div class="module-grid compact">${modules.slice(0, 3).map(moduleCard).join("")}</div>
    <div class="lower-grid"><section class="panel next-panel"><div class="panel-heading"><div><div class="eyebrow">ПОСЛЕДНЯЯ АКТИВНОСТЬ</div><h3>Ваш архивный журнал</h3></div><span class="status-chip">${attempts ? "СОХРАНЕНО" : "ОЖИДАНИЕ"}</span></div>${last ? `<div class="activity-row"><span class="activity-icon">✓</span><div><strong>${escapeHtml(last.moduleTitle)}</strong><small>Тест · уровень ${last.tier} · ${escapeHtml(last.date)}</small></div><b>${last.score}/${last.total}</b></div>` : `<div class="empty-state"><span class="empty-glyph">∅</span><strong>Пока нет записей</strong><small>Результаты ваших тестов появятся здесь.</small><button class="button button-small" data-page="tests">Выбрать тест</button></div>`}</section>
    <section class="panel next-panel"><div class="panel-heading"><div><div class="eyebrow">ФОРМЫ РАБОТЫ</div><h3>Выберите способ изучения</h3></div></div><div class="format-list"><button data-page="tests"><span>01</span><strong>Тестирование</strong><small>Базовый · уверенный · экспертный</small><b>→</b></button><button data-page="crossword"><span>02</span><strong>Кроссворд</strong><small>Термины и исторические личности</small><b>→</b></button><button data-page="games"><span>03</span><strong>Игровая рефлексия</strong><small>Шесть разных механик</small><b>→</b></button><button data-page="quiz-games"><span>04</span><strong>Командные викторины</strong><small>2 игры · 5 тем · 10–50 баллов</small><b>→</b></button></div></section></div>`;
}
function moduleCard(item) {
  const isDone = progress.completed.includes(item.id);
  return `<article class="module-card"><div class="module-card-top"><span class="module-number">${item.number}</span><span class="module-period">${item.period}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p><div class="module-card-bottom"><span class="module-complete ${isDone ? "done" : ""}"><i></i>${isDone ? "ИЗУЧЕНО" : item.years}</span><button class="round-arrow" data-module="${item.id}" aria-label="Открыть модуль ${escapeHtml(item.title)}">↗</button></div></article>`;
}
function archivePage() {
  return `${pageHeading("ИСТОРИЧЕСКИЙ АРХИВ / 01—06", "Материалы архива", "Шесть тематических модулей: от ранних князей до объединения земель вокруг Москвы.")}<div class="filter-row"><span class="filter-label">ХРОНОЛОГИЧЕСКИЙ МАРШРУТ</span><span class="filter-line"></span><span class="mono muted">IX — XVI ВЕК</span></div><div class="module-grid">${modules.map(moduleCard).join("")}</div>
    <div class="source-note"><span class="note-icon">i</span><div><strong>О методе работы с источниками</strong><p>Даты и рассказы средневековых летописей не всегда совпадают с современными реконструкциями. В материалах отмечены условные даты, поздние списки и спорные детали.</p></div></div>`;
}
function modulePage() {
  const item = currentModule();
  const favorite = progress.favorites.includes(item.id);
  return `${pageHeading(`АРХИВ / МОДУЛЬ ${item.number}`, escapeHtml(item.title), escapeHtml(item.subtitle), `<button class="button button-outline" data-action="favorite" data-id="${item.id}">${favorite ? "★ В ИЗБРАННОМ" : "☆ В ИЗБРАННОЕ"}</button>`)}
    <div class="module-detail-grid"><div class="module-main">
      <section class="panel module-intro"><div class="module-meta"><span>${item.period}</span><span class="mono">${item.years}</span></div><p class="lead">${escapeHtml(item.intro)}</p>${item.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">КЛЮЧЕВЫЕ СОБЫТИЯ</div><h3>Хронология</h3></div><span class="mono muted">${item.timeline.length} ЗАПИСЕЙ</span></div><div class="timeline">${item.timeline.map(([date, text]) => `<div class="timeline-item"><span class="timeline-date">${escapeHtml(date)}</span><p>${escapeHtml(text)}</p></div>`).join("")}</div></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">ПОНЯТИЯ</div><h3>Словарь модуля</h3></div></div><div class="term-grid">${item.terms.map(([term, definition]) => `<div class="term-entry"><strong>${escapeHtml(term)}</strong><p>${escapeHtml(definition)}</p></div>`).join("")}</div></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">ИСТОРИЧЕСКИЕ ЛИЧНОСТИ</div><h3>Ключевые фигуры</h3></div></div><ul class="people-list">${item.people.map((person) => `<li>${escapeHtml(person)}</li>`).join("")}</ul></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">РАБОТА С ИСТОЧНИКАМИ</div><h3>На что обратить внимание</h3></div></div><ul class="source-list">${item.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}</ul></section>
      <section class="panel practice-panel"><div class="eyebrow">ПРАКТИЧЕСКОЕ ЗАДАНИЕ · УРОВЕНЬ 3</div><p>${escapeHtml(item.practice)}</p><button class="button button-small" data-page="tests" data-tier="3" data-module="${item.id}">Ответить на вопросы по теме</button></section>
    </div><aside class="module-aside"><div class="panel module-quick"><div class="eyebrow">МАРШРУТ ИССЛЕДОВАТЕЛЯ</div><button data-page="tests" data-module="${item.id}"><span class="quick-icon">✓</span><span><strong>Проверить знания</strong><small>3 уровня · ${item.questions.length} вопроса</small></span><b>→</b></button><button data-page="crossword" data-module="${item.id}"><span class="quick-icon">▦</span><span><strong>Решить кроссворд</strong><small>${item.crossword.length} слов</small></span><b>→</b></button><button data-page="games" data-game="${item.game}" data-module="${item.id}"><span class="quick-icon">⌁</span><span><strong>${escapeHtml(gameTitles[item.game])}</strong><small>Игровая рефлексия</small></span><b>→</b></button><button data-action="mark-complete" data-id="${item.id}"><span class="quick-icon">✓</span><span><strong>${progress.completed.includes(item.id) ? "Снять отметку" : "Отметить изученным"}</strong><small>Локальный прогресс</small></span><b>→</b></button></div><div class="panel"><div class="eyebrow">КОНТЕКСТ</div><h3>О модуле</h3><p class="small-copy">Материал построен по принципу: событие → свидетельство → осторожный вывод. В спорных случаях указаны оговорки.</p><div class="mini-stat"><span>ПЕРИОД</span><b>${escapeHtml(item.years)}</b></div></div></aside></div>`;
}
function testsPage() {
  const item = currentModule();
  const setKey = `${item.id}-${state.tier}`;
  if (state.quizSetKey !== setKey || !state.quizQuestionSet) {
    state.quizSetKey = setKey;
    state.quizQuestionSet = shuffle(item.questions.filter((question) => question.tier === state.tier));
    state.quizVariant = String(Math.floor(1000 + Math.random() * 9000));
  }
  const questions = state.quizQuestionSet;
  const levelNames = ["", "БАЗОВЫЙ · НА «3»", "УВЕРЕННЫЙ · НА «4»", "ЭКСПЕРТНЫЙ · НА «5»"];
  return `${pageHeading("ПРОВЕРКА ЗНАНИЙ", "Тестирование", "Выберите тему и уровень. Уровень 2 включает работу с понятиями и хронологией; уровень 3 — анализ исторических свидетельств.")}
    <div class="test-toolbar"><label class="select-label">ТЕМА<select id="test-module">${modules.map((m) => `<option value="${m.id}" ${m.id === item.id ? "selected" : ""}>${m.number} · ${escapeHtml(m.title)}</option>`).join("")}</select></label><div class="tier-selector">${[1, 2, 3].map((tier) => `<button data-tier="${tier}" class="tier-button ${state.tier === tier ? "selected" : ""}"><small>УРОВЕНЬ ${tier}</small><strong>${["", "Основа", "Применение", "Анализ"][tier]}</strong></button>`).join("")}</div></div>
    <div class="test-level"><span class="level-indicator level-${state.tier}">0${state.tier}</span><div><div class="eyebrow">${levelNames[state.tier]} / ВАРИАНТ ${state.quizVariant}</div><strong>${["", "Факты и простые понятия", "Термины и хронологическая последовательность", "Анализ текста и аргументация"][state.tier]}</strong></div><span class="mono muted">${questions.length} ВОПРОСОВ</span></div>
    <form id="quiz-form" class="quiz-form" data-module="${item.id}" data-tier="${state.tier}">${questions.map((question, index) => quizQuestion(question, index)).join("")}<div class="quiz-submit"><p>В каждом уровне 10 вопросов. Порядок заданий и варианты ответов перемешиваются. Результат сохранится только в этом браузере.</p><button class="button button-primary" type="submit">ПРОВЕРИТЬ ОТВЕТЫ <span>→</span></button></div></form>`;
}
function quizQuestion(question, index) {
  const qId = `q-${index}`;
  let input;
  if (question.type === "choice" || question.type === "source-choice") {
    const shuffledOptions = shuffle(question.options.map((option, originalIndex) => ({ option, originalIndex })));
    input = `<div class="answer-options">${shuffledOptions.map(({ option, originalIndex }, optionIndex) => `<label class="answer-option"><input type="radio" name="${qId}" value="${originalIndex}" /><span class="option-key">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHtml(option)}</span></label>`).join("")}</div>`;
  } else if (question.type === "order") {
    input = `<div class="order-answers">${question.options.map((option, orderIndex) => `<label><span>${orderIndex + 1}</span><select name="${qId}-${orderIndex}" aria-label="Позиция события ${escapeHtml(option)}"><option value="">Позиция…</option>${question.options.map((_, n) => `<option value="${n}">${n + 1}</option>`).join("")}</select><b>${escapeHtml(option)}</b></label>`).join("")}</div>`;
  } else {
    input = `<label class="text-answer"><span>ВАШ ОТВЕТ</span><input type="text" name="${qId}" autocomplete="off" placeholder="Напишите краткий ответ" /></label>`;
  }
  return `<article class="quiz-question" data-question="${index}"><div class="question-meta"><span>ВОПРОС ${String(index + 1).padStart(2, "0")}</span><span class="question-type">${question.type === "choice" ? "ВЫБОР" : question.type === "source-choice" ? "АНАЛИЗ ИСТОЧНИКА" : question.type === "order" ? "ХРОНОЛОГИЯ" : question.type === "term" ? "ТЕРМИН / КРАТКИЙ ОТВЕТ" : "АНАЛИЗ"}</span></div><h3>${escapeHtml(question.prompt)}</h3>${input}<div class="question-feedback" hidden></div></article>`;
}
function crosswordPage() {
  const item = currentModule();
  return `${pageHeading("ЛЕКСИЧЕСКОЕ ИСПЫТАНИЕ", "Кроссворд архива", "Вспомните ключевые имена, события и понятия. Введите ответ к каждой подсказке и проверьте себя.")}
    <div class="crossword-toolbar"><label class="select-label">ТЕМА<select id="crossword-module">${modules.map((m) => `<option value="${m.id}" ${m.id === item.id ? "selected" : ""}>${m.number} · ${escapeHtml(m.title)}</option>`).join("")}</select></label><div class="crossword-score">СЛОВ В ТЕМЕ <strong>${String(item.crossword.length).padStart(2, "0")}</strong></div></div>
    <form id="crossword-form" class="crossword-layout" data-module="${item.id}"><section class="panel crossword-clues"><div class="panel-heading"><div><div class="eyebrow">ПО ГОРИЗОНТАЛИ</div><h3>Подсказки</h3></div><span class="mono muted">ТЕРМИНЫ · ИМЕНА · МЕСТА</span></div>${item.crossword.map(([answer, clue], i) => `<div class="clue-row"><span class="clue-number">${String(i + 1).padStart(2, "0")}</span><div class="clue-text"><label for="clue-${i}-0">${escapeHtml(clue)}</label><div class="clue-cells" role="group" aria-label="Ответ на подсказку ${i + 1}">${Array.from(answer).map((_, letterIndex) => `<input id="clue-${i}-${letterIndex}" name="clue-${i}-${letterIndex}" maxlength="1" autocomplete="off" autocapitalize="characters" aria-label="Буква ${letterIndex + 1} из ${answer.length}" />`).join("")}</div></div><span class="clue-mark" id="clue-mark-${i}">—</span></div>`).join("")}<div class="crossword-actions"><button type="submit" class="button button-primary">ПРОВЕРИТЬ СЛОВА <span>→</span></button><button type="button" class="button button-quiet" data-action="crossword-reset">СБРОСИТЬ</button></div><div id="crossword-result" class="crossword-result" aria-live="polite"></div></section><aside class="panel crossword-aside"><div class="eyebrow">КАК ИГРАТЬ</div><h3>Проверьте себя</h3><p class="small-copy">Впишите слово по одной букве в клетки. Регистр и буква «ё» не влияют на проверку. Термины приводите в именительном падеже.</p><div class="word-signal"><span class="signal-dot"></span><span>ЛОКАЛЬНАЯ ПРОВЕРКА</span></div><button class="button button-outline button-full" data-page="tests" data-module="${item.id}">Перейти к тесту</button></aside></form>`;
}
function quizGamesPage() {
  const game = quizGames.find((item) => item.id === quizProgress.selectedGameId) || quizGames[0];
  quizProgress.selectedGameId = game.id;
  const board = quizBoardState(game.id);
  const questions = game.categories.flatMap((category) => category.questions);
  const activeQuestion = questions.find((question) => question.id === board.activeQuestionId);
  const scoreBoard = `<div class="quiz-team-grid">${board.teams.map((team, index) => `<label class="quiz-team-card"><span>КОМАНДА ${String(index + 1).padStart(2, "0")}</span><input data-team-name="${escapeHtml(team.id)}" maxlength="24" value="${escapeHtml(team.name)}" aria-label="Название команды ${index + 1}" /><strong>${team.score}<small>БАЛЛОВ</small></strong></label>`).join("")}</div>`;
  const questionPanel = activeQuestion ? `<section class="panel quiz-active-question"><div class="quiz-active-meta"><span>${escapeHtml(activeQuestion.points)} БАЛЛОВ</span><span>${board.answerRevealed ? "ОТВЕТ ОТКРЫТ" : "ВОПРОС НА ЭКРАНЕ"}</span></div><h2>${escapeHtml(activeQuestion.prompt)}</h2>${board.answerRevealed ? `<div class="quiz-correct-answer"><span>ПРАВИЛЬНЫЙ ОТВЕТ</span><strong>${escapeHtml(activeQuestion.answer)}</strong></div><div class="quiz-award-grid">${board.teams.map((team, index) => `<button class="button button-primary" data-action="award-quiz-points" data-team-id="${escapeHtml(team.id)}">КОМАНДА ${index + 1} · ${escapeHtml(team.name)} <b>+${activeQuestion.points}</b></button>`).join("")}</div><button class="button button-quiet" data-action="skip-quiz-question">Снять вопрос без баллов</button>` : `<button class="button button-primary" data-action="reveal-quiz-answer">ПРОВЕРИТЬ ОТВЕТ</button>`}</section>` : `<section class="panel quiz-active-question quiz-instructions"><div class="eyebrow">ПРАВИЛА</div><h3>Выберите вопрос на игровом поле</h3><p>Ведущий открывает вопрос, команды отвечают устно. После проверки нажмите кнопку команды, чей ответ верный: ей начислятся баллы, а вопрос закроется.</p></section>`;
  const history = board.history.slice(0, 8);
  return `${pageHeading("GAME CENTER / КОМАНДНЫЙ РЕЖИМ", "Историческая викторина", "Две игры по пяти темам. Сложность и цена вопроса растут от 10 до 50 баллов. Счёт сохраняется в этом браузере.")}<div class="quiz-game-toolbar"><label class="select-label">ВИКТОРИНА<select id="quiz-game-select">${quizGames.map((item) => `<option value="${item.id}" ${item.id === game.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></label><div class="quiz-game-subtitle">${escapeHtml(game.subtitle)}</div></div>
    <section class="panel quiz-teams-panel"><div class="panel-heading"><div><div class="eyebrow">ТАБЛИЦА СЧЁТА</div><h3>Команды</h3></div><button class="button button-outline button-small" data-action="add-quiz-team" ${board.teams.length >= 6 ? "disabled" : ""}>+ ДОБАВИТЬ КОМАНДУ</button></div>${scoreBoard}</section>
    ${questionPanel}
    <div class="quiz-board-scroll"><div class="quiz-board">${game.categories.map((category) => `<section class="quiz-category"><h3>${escapeHtml(category.title)}</h3>${category.questions.map((question) => { const used = board.completedQuestions.includes(question.id); const active = board.activeQuestionId === question.id; return `<button class="quiz-cell ${used ? "used" : ""} ${active ? "active" : ""}" data-quiz-question="${escapeHtml(question.id)}" ${used || board.activeQuestionId ? "disabled" : ""} aria-label="${escapeHtml(category.title)}, ${question.points} баллов">${used ? "✓" : question.points}</button>`; }).join("")}</section>`).join("")}</div></div>
    <section class="panel quiz-history"><div class="panel-heading"><div><div class="eyebrow">ИГРОВОЙ ЖУРНАЛ</div><h3>Последние ответы</h3></div><span class="mono muted">${board.completedQuestions.length} / 25 ВОПРОСОВ</span></div>${history.length ? `<div class="quiz-history-list">${history.map((entry) => `<div><span>${escapeHtml(entry.teamName || "Без баллов")}</span><b>${escapeHtml(entry.question)}</b><strong>${entry.points ? `+${entry.points}` : "0"} Б</strong></div>`).join("")}</div>` : `<p class="small-copy">После первого ответа здесь появится история начислений.</p>`}</section>`;
}
function gamesPage() {
  if (state.gameId) return gamePage();
  return `${pageHeading("GAME CENTER / 06", "Игровые испытания", "Разные механики для повторения материала. В условных игровых сценариях альтернативы не выдаются за реальные события.")}
    <div class="game-grid">${modules.map((item) => `<article class="game-card"><div class="game-card-top"><span class="game-code">SIM-${item.number}</span><span class="game-symbol">${gameSymbol(item.game)}</span></div><div class="eyebrow">${escapeHtml(item.period)}</div><h3>${escapeHtml(gameTitles[item.game])}</h3><p>${escapeHtml(gameDescription(item.game))}</p><div class="game-card-bottom"><span>ТЕМА ${item.number}</span><button class="button button-small" data-page="games" data-game="${item.game}" data-module="${item.id}">НАЧАТЬ <span>→</span></button></div></article>`).join("")}</div>`;
}
function gameSymbol(id) {
  return ({ chronology: "↟", vladimir: "◇", detective: "⌕", regions: "⌖", decisions: "▣", moscow: "⌘" })[id] || "⌁";
}
function gameDescription(id) {
  return ({
    chronology: "Восстановите порядок событий. Переставляйте карточки и обоснуйте датировки.",
    vladimir: "Пройдите три этапа исторического квеста: контекст, свидетельства и вывод.",
    detective: "Найдите анахронизмы и неточные утверждения в досье эпохи Ярослава.",
    regions: "Соотнесите политические центры с регионами и особенностями управления.",
    decisions: "Разберите последствия похода, упорядочив события и выбрав доказуемые выводы.",
    moscow: "Сопоставьте правителей, события и даты на пути централизации."
  })[id];
}
function gamePage() {
  const game = state.gameId;
  const item = currentModule();
  const title = gameTitles[game];
  let body = "";
  if (game === "chronology") body = chronologyGame(item);
  if (game === "vladimir") body = vladimirGame();
  if (game === "detective") body = detectiveGame();
  if (game === "regions") body = regionsGame();
  if (game === "decisions") body = decisionsGame();
  if (game === "moscow") body = moscowGame();
  return `${pageHeading(`GAME CENTER / ${item.number}`, escapeHtml(title), escapeHtml(gameDescription(game)), `<button class="button button-quiet" data-action="exit-game">← К ИГРАМ</button>`)}<div class="game-play-panel panel"><div class="game-play-header"><div><div class="eyebrow">ИГРОВОЕ ИСПЫТАНИЕ · ${escapeHtml(item.title.toUpperCase())}</div><h2>${escapeHtml(title)}</h2></div><span class="game-score">ОЧКИ <b>${state.gameScore}</b></span></div>${body}</div>`;
}
function chronologyGame(item) {
  const events = item.timeline.slice(0, 5);
  if (!state.gameOrder.length) state.gameOrder = shuffle(events.map((_, i) => i));
  return `<p class="game-instruction">Переместите события в хронологический порядок с помощью стрелок, затем проверьте последовательность.</p><div class="sortable-list">${state.gameOrder.map((eventIndex, position) => `<div class="sortable-item"><span class="sort-position">${String(position + 1).padStart(2, "0")}</span><span class="sort-date">?</span><strong>${escapeHtml(events[eventIndex][1])}</strong><div class="sort-controls"><button data-game-move="${position}" data-direction="-1" aria-label="Переместить вверх" ${position === 0 ? "disabled" : ""}>↑</button><button data-game-move="${position}" data-direction="1" aria-label="Переместить вниз" ${position === state.gameOrder.length - 1 ? "disabled" : ""}>↓</button></div></div>`).join("")}</div><div class="game-actions"><button class="button button-primary" data-action="check-chronology">ПРОВЕРИТЬ ПОРЯДОК</button><span class="muted small-copy">Исторические даты указаны после проверки.</span></div><div id="game-feedback" class="game-feedback"></div>`;
}
function vladimirGame() {
  const stages = [
    { prompt: "Какую христианскую традицию приняла Русь при Владимире?", options: ["Византийского обряда", "Римского обряда", "Коптскую"], correct: 0, feedback: "Принята христианская традиция византийского обряда." },
    { prompt: "Какой город назван Корсунью в летописном рассказе?", options: ["Херсонес", "Константинополь", "Киев"], correct: 0, feedback: "Корсунь — средневековое название Херсонеса." },
    { prompt: "Как корректнее описать христианизацию Руси?", options: ["Длительный процесс, начавшийся с княжеского решения", "Одновременное крещение всего населения в один день", "Событие, никак не связанное с внешней политикой"], correct: 0, feedback: "Крещение князя и киевлян — важные этапы, но распространение новой веры заняло время." }
  ];
  const current = stages[state.gameStep];
  if (!current) return gameFinish("Квест завершён", "Вы прошли три этапа. Помните: летописное повествование — важный источник, но детали событий сопоставляют с другими данными.");
  return `<div class="quest-progress">${stages.map((_, i) => `<span class="${i <= state.gameStep ? "active" : ""}"></span>`).join("")}</div><div class="quest-card"><div class="eyebrow">ЭТАП 0${state.gameStep + 1} / 03</div><h3>${current.prompt}</h3><div class="quest-options">${current.options.map((option, i) => `<button data-game-choice="${i}"><span>${String.fromCharCode(65 + i)}</span>${escapeHtml(option)}</button>`).join("")}</div><div id="game-feedback" class="game-feedback"></div></div>`;
}
function detectiveGame() {
  const claims = [
    ["Русская Правда — комплекс правовых текстов, складывавшихся в XI–XII веках.", true, "Верно: памятник формировался и дополнялся, а не был создан одномоментно."],
    ["Софийский собор в Киеве был построен при Ярославе Мудром.", true, "В целом верно; отдельные датировки строительства обсуждаются."],
    ["Русская Правда была напечатана в типографии в 1037 году.", false, "Анахронизм: книгопечатание появилось на Руси значительно позже Средневековья."],
    ["Иларион связан с созданием «Слова о законе и благодати».", true, "Авторство традиционно приписывается Илариону."],
    ["После смерти Ярослава в 1054 году сразу установилась наследственная монархия современного типа.", false, "Это обобщение и анахронизм: порядок княжеского наследования был сложным и конфликтным."]
  ];
  return `<p class="game-instruction">Отметьте только утверждения с исторической ошибкой или анахронизмом. Два утверждения требуют критической проверки.</p><div class="claim-list">${claims.map(([text, correct], i) => `<label class="claim-row"><input type="checkbox" name="claim-${i}" /><span class="claim-number">0${i + 1}</span><span>${escapeHtml(text)}</span><b class="claim-result" id="claim-result-${i}">?</b></label>`).join("")}</div><button class="button button-primary" data-action="check-claims">ПРОВЕРИТЬ ДОСЬЕ</button><div id="game-feedback" class="game-feedback"></div>`;
}
function regionsGame() {
  const prompts = [
    ["Новгородская земля", "Вече, посадничество и значимая роль городского политического сообщества."],
    ["Владимиро-Суздальская земля", "Северо-восточный центр, где усиливались княжеские города Владимир и Суздаль."],
    ["Галицко-Волынская земля", "Юго-западная земля; Галич и Волынь были объединены Романом Мстиславичем."]
  ];
  return `<p class="game-instruction">Соотнесите политический центр с описанием. Схема условная, не является географической картой; термины отражают средневековые институты, а не современные политические системы.</p><div class="region-map" role="img" aria-label="Условная схема расположения Новгорода, Владимира и Галича"><div class="map-label map-label-north">СЕВЕРО-ЗАПАД</div><div class="map-label map-label-center">СЕВЕРО-ВОСТОК</div><div class="map-label map-label-south">ЮГО-ЗАПАД</div><span class="map-node node-1">НОВГОРОД</span><span class="map-node node-2">ВЛАДИМИР</span><span class="map-node node-3">ГАЛИЧ</span><div class="map-lines"></div></div><div class="matching-list">${prompts.map(([name, desc], i) => `<label class="match-row"><span>${escapeHtml(desc)}</span><select name="region-${i}" aria-label="Выберите землю для описания"><option value="">Выбрать землю…</option>${prompts.map(([n]) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}</select></label>`).join("")}</div><button class="button button-primary" data-action="check-regions">ПРОВЕРИТЬ КАРТУ</button><div id="game-feedback" class="game-feedback"></div>`;
}
function decisionsGame() {
  const events = [
    "Битва на Калке (1223)",
    "Начало похода Батыя на Северо-Восточную Русь (1237)",
    "Поход на южные земли и взятие Киева (1239–1240)",
    "Установление системы зависимости и сбор дани"
  ];
  if (!state.gameOrder.length) state.gameOrder = shuffle(events.map((_, i) => i));
  return `<div class="scenario-note"><strong>Сценарий анализа</strong><p>Это не симуляция альтернативной истории. Восстановите последовательность зафиксированных этапов и затем выберите точный вывод.</p></div><div class="sortable-list">${state.gameOrder.map((eventIndex, position) => `<div class="sortable-item"><span class="sort-position">${position + 1}</span><strong>${escapeHtml(events[eventIndex])}</strong><div class="sort-controls"><button data-game-move="${position}" data-direction="-1" ${position === 0 ? "disabled" : ""}>↑</button><button data-game-move="${position}" data-direction="1" ${position === state.gameOrder.length - 1 ? "disabled" : ""}>↓</button></div></div>`).join("")}</div><button class="button button-primary" data-action="check-decisions">ПРОВЕРИТЬ ПОСЛЕДОВАТЕЛЬНОСТЬ</button><div id="game-feedback" class="game-feedback"></div>`;
}
function moscowGame() {
  const matches = [
    ["Иван I Калита", "Укрепил позиции Москвы в первой половине XIV века."],
    ["Дмитрий Донской", "Возглавил русское войско в Куликовской битве 1380 года."],
    ["Иван III", "Присоединение Новгорода (1478), Судебник (1497), стояние на Угре (1480)."],
    ["Василий III", "Продолжил объединение; при нём присоединены Псков и Рязань."]
  ];
  return `<p class="game-instruction">Сопоставьте правителя с событием. Даты помогают отличить крупную военную победу от завершения политической зависимости.</p><div class="matching-list ruler-list">${matches.map(([name, clue], i) => `<label class="match-row"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(clue)}</small></span><select name="ruler-${i}" aria-label="Выберите правителя"><option value="">Выберите правителя…</option>${matches.map(([n]) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}</select></label>`).join("")}</div><button class="button button-primary" data-action="check-moscow">ПРОВЕРИТЬ СОПОСТАВЛЕНИЯ</button><div id="game-feedback" class="game-feedback"></div>`;
}
function gameFinish(title, text) {
  return `<div class="game-finish"><span class="finish-icon">✓</span><div class="eyebrow">ИСПЫТАНИЕ ПРОЙДЕНО</div><h3>${title}</h3><p>${escapeHtml(text)}</p><button class="button button-primary" data-action="exit-game">ВЕРНУТЬСЯ В GAME CENTER</button><button class="button button-quiet" data-action="restart-game">ПРОЙТИ ЕЩЁ РАЗ</button></div>`;
}
function stopClassroomWatch() {
  if (classroomUnsubscribe) classroomUnsubscribe();
  classroomUnsubscribe = null;
  classroomSubscriptionKey = "";
}
async function watchCurrentClassroom() {
  const session = state.classroom;
  if (!session) return;
  const key = `${session.role}:${session.code}:${session.uid}`;
  if (classroomSubscriptionKey === key) return;
  stopClassroomWatch();
  classroomSubscriptionKey = key;
  try {
    const { watchClassroom } = await import("./firebase-classroom.js");
    if (!state.classroom || `${state.classroom.role}:${state.classroom.code}:${state.classroom.uid}` !== key) return;
    classroomUnsubscribe = watchClassroom(session.code, session.role, session.uid, {
      onMeta: (meta) => {
        if (!state.classroom || classroomSubscriptionKey !== key) return;
        if (!meta) {
          state.classroom.error = "Занятие не найдено или удалено.";
        } else {
          state.classroom.meta = meta;
          state.classroom.error = "";
          if (session.role === "teacher") state.teacher = { uid: meta.ownerUid, email: state.teacher?.email || "" };
        }
        render();
      },
      onParticipants: (participants) => {
        if (!state.classroom || classroomSubscriptionKey !== key) return;
        state.classroom.participants = participants || {};
        render();
      },
      onResponses: (responses) => {
        if (!state.classroom || classroomSubscriptionKey !== key) return;
        state.classroom.responses = responses || {};
        render();
      },
      onResponse: (response) => {
        if (!state.classroom || classroomSubscriptionKey !== key) return;
        state.classroom.response = response;
        if (state.classroom.draft === undefined) state.classroom.draft = response?.text || "";
        render();
      },
      onError: (error) => {
        if (!state.classroom || classroomSubscriptionKey !== key) return;
        state.classroom.error = classroomErrorText(error);
        render();
      }
    });
  } catch (error) {
    if (state.classroom && classroomSubscriptionKey === key) {
      state.classroom.error = classroomErrorText(error);
      render();
    }
  }
}
function resumeStoredClassroom() {
  if (state.page !== "classroom" || state.classroom || state.joining) return;
  const saved = localStorage.getItem(LIVE_KEY);
  if (!saved) return;
  try {
    const stored = JSON.parse(saved);
    if (!stored.code || !stored.uid) throw new Error("Сохранённые данные занятия повреждены.");
    state.classroom = {
      ...stored,
      role: "teacher",
      meta: null,
      participants: {},
      responses: {}
    };
    render();
    watchCurrentClassroom();
  } catch {
    localStorage.removeItem(LIVE_KEY);
    toast("Не удалось восстановить сохранённое занятие.");
  }
}
function classroomErrorText(error) {
  if (error?.code === "auth/operation-not-allowed") return "В Firebase включите Authentication → Email/Password и Anonymous.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error?.code)) return "Неверная почта или пароль преподавателя.";
  if (error?.code === "PERMISSION_DENIED" || error?.code === "database/permission-denied" || error?.message?.includes("PERMISSION_DENIED")) return "Проверьте правила базы и убедитесь, что UID аккаунта есть в списке преподавателей.";
  if (error?.code === "auth/network-request-failed" || error?.message?.includes("Failed to fetch")) return "Нет связи с Firebase. Проверьте подключение к интернету.";
  return error?.message || "Не удалось подключиться к Firebase.";
}
function classroomPage() {
  if (state.classroom?.role === "student") return studentClassroomPage(state.classroom);
  if (state.joining && state.joinCode) return joinPage();
  const session = state.classroom;
  const error = session?.error ? `<div class="classroom-warning"><span>!</span><p>${escapeHtml(session.error)}</p></div>` : "";
  const teacherPanel = state.teacher
    ? `<div class="panel-heading"><div><div class="eyebrow">ПРЕПОДАВАТЕЛЬ</div><h3>${escapeHtml(state.teacher.email || "Вход выполнен")}</h3></div><button class="button button-quiet button-small" data-action="teacher-signout">ВЫЙТИ</button></div><div class="eyebrow">НОВОЕ ЗАНЯТИЕ</div><h3>Настроить занятие</h3><form id="session-form"><label class="form-field"><span>НАЗВАНИЕ ЗАНЯТИЯ</span><input name="session-title" required maxlength="70" placeholder="Например, Русь при Ярославе Мудром" /></label><label class="form-field"><span>УЧЕБНЫЙ МОДУЛЬ</span><select name="session-module">${modules.map((m) => `<option value="${m.id}">${m.number} · ${escapeHtml(m.title)}</option>`).join("")}</select></label><label class="form-field"><span>ФОРМА РАБОТЫ</span><select name="session-work"><option value="test">Тест · базовый уровень</option><option value="test-2">Тест · уверенный уровень</option><option value="crossword">Кроссворд</option><option value="game">Игровая рефлексия</option></select></label><button class="button button-primary button-full" type="submit" ${session?.meta?.status === "open" ? "disabled" : ""}>СОЗДАТЬ ЗАНЯТИЕ <span>→</span></button></form>`
    : `<div class="eyebrow">ВХОД ПРЕПОДАВАТЕЛЯ</div><h3>Войдите в аккаунт</h3><p class="small-copy">Аккаунт преподавателя создаётся в Firebase Console; регистрация с сайта отключена.</p><form id="teacher-login-form"><label class="form-field"><span>ПОЧТА</span><input type="email" name="teacher-email" required autocomplete="username" /></label><label class="form-field"><span>ПАРОЛЬ</span><input type="password" name="teacher-password" required autocomplete="current-password" /></label><button class="button button-primary button-full" type="submit">ВОЙТИ <span>→</span></button></form>`;
  return `${pageHeading("LIVE CLASSROOM / FIREBASE", "Занятие в аудитории", "Создайте занятие, поделитесь кодом или QR-ссылкой и принимайте ответы в реальном времени.")}
    ${error}<div class="classroom-warning"><span>i</span><p>Ученики входят анонимно. Тесты, кроссворды и игры проверяются в браузере; преподаватель видит результаты в реальном времени. Для официальных оценок учитывайте, что клиентскую проверку можно подменить.</p></div>
    <div class="classroom-grid"><section class="panel classroom-create">${teacherPanel}</section>
    <section class="panel classroom-display">${session ? sessionDisplay(session) : `<div class="empty-classroom"><div class="qr-placeholder"><span>H://</span></div><div class="eyebrow">ПАНЕЛЬ ПРЕПОДАВАТЕЛЯ</div><h3>Сессия ещё не создана</h3><p>После создания появятся код, ссылка для подключения и ответы учеников.</p><div class="empty-classroom-line"><span>УЧАСТНИКИ</span><b>—</b></div><div class="empty-classroom-line"><span>СТАТУС</span><b>ОЖИДАНИЕ</b></div></div>`}</section></div>`;
}
function sessionDisplay(session) {
  const meta = session.meta || {};
  const participants = Object.entries(session.participants || {});
  const responses = session.responses || {};
  const roster = participants.length
    ? participants.map(([uid, participant]) => `<article class="classroom-response"><div class="classroom-response-head"><strong>${escapeHtml(participant.name)}</strong><span>${responses[uid] ? responses[uid].score !== undefined ? `${responses[uid].score} / ${responses[uid].total}` : "ОТВЕТ ПОЛУЧЕН" : "ОЖИДАЕТ ОТВЕТА"}</span></div><p>${responses[uid] ? escapeHtml(responses[uid].text) : "Ответ появится здесь после отправки учеником."}</p></article>`).join("")
    : `<p class="small-copy">Когда ученики подключатся, их имена появятся здесь.</p>`;
  return `<div class="class-session-head"><div><div class="eyebrow">FIREBASE REALTIME SESSION</div><h3>${escapeHtml(meta.title || "Загрузка занятия…")}</h3><p>${escapeHtml(meta.moduleTitle || "")} · ${escapeHtml(meta.workLabel || "")}</p></div><span class="status-chip">${meta.status === "closed" ? "ЗАКРЫТО" : "АКТИВНО"}</span></div><div class="session-content"><div class="qr-wrap"><canvas id="qr-canvas" width="220" height="220" aria-label="QR-код ссылки на занятие"></canvas><div id="qr-note" class="qr-note">Генерация QR…</div></div><div class="session-details"><span>КОД ПОДКЛЮЧЕНИЯ</span><strong class="session-code">${escapeHtml(session.code)}</strong><button class="button button-outline button-small" data-action="copy-link">КОПИРОВАТЬ ССЫЛКУ</button><button class="text-button" data-action="download-qr">Скачать QR-код <span>↓</span></button><div class="session-url">${escapeHtml(session.url)}</div><div class="local-participants"><span>УЧАСТНИКИ</span><b>${participants.length}</b></div></div></div><section class="classroom-responses"><div class="eyebrow">ОТВЕТЫ УЧЕНИКОВ</div>${roster}</section><div class="session-disclaimer">Ответы и имена синхронизируются через Firebase Realtime Database. Не отправляйте персональные или чувствительные данные.</div><button class="button button-quiet" data-action="close-session" ${meta.status === "closed" ? "disabled" : ""}>ЗАКРЫТЬ ЗАНЯТИЕ</button>`;
}
function studentClassroomPage(session) {
  const meta = session.meta || {};
  const error = session.error ? `<div class="classroom-warning"><span>!</span><p>${escapeHtml(session.error)}</p></div>` : "";
  const closed = meta.status === "closed";
  const result = session.response?.score !== undefined ? `<div class="feedback-box ${session.response.score === session.response.total ? "correct" : "incorrect"}"><strong>РЕЗУЛЬТАТ: ${session.response.score} / ${session.response.total}</strong><p>Результат автоматической проверки отправлен преподавателю.</p></div>` : "";
  const activity = {
    test: "НАЧАТЬ ТЕСТ · БАЗОВЫЙ УРОВЕНЬ",
    "test-2": "НАЧАТЬ ТЕСТ · УВЕРЕННЫЙ УРОВЕНЬ",
    crossword: "ОТКРЫТЬ КРОССВОРД",
    game: "НАЧАТЬ ИГРУ"
  }[meta.workId] || "НАЧАТЬ ЗАДАНИЕ";
  return `${pageHeading("LIVE CLASSROOM / УЧЕНИК", escapeHtml(meta.title || "Занятие"), `${escapeHtml(meta.moduleTitle || "")} · ${escapeHtml(meta.workLabel || "")}`)}${error}
    <section class="join-card panel"><div class="eyebrow">ВЫ ПОДКЛЮЧЕНЫ К ЗАНЯТИЮ</div><h3>${escapeHtml(session.name)}</h3>${result}${closed ? `<div class="classroom-warning"><span>!</span><p>Преподаватель закрыл занятие. Новые ответы больше не принимаются.</p></div>` : `<p class="small-copy">Выполните задание. Тесты, кроссворд и игра проверяются автоматически; результат появится у преподавателя.</p><button class="button button-primary button-full" data-action="start-classroom-work">${activity} <span>→</span></button>`}<button class="text-button" data-action="leave-join">ОТКЛЮЧИТЬСЯ</button></section>`;
}
function joinPage() {
  const code = state.joinCode.toUpperCase();
  return `${pageHeading("LIVE CLASSROOM / УЧЕНИК", "Подключение к занятию", "Введите имя или псевдоним. Регистрация и контактные данные не нужны.")}
    <div class="join-card panel"><div class="join-mark">H://</div><div class="eyebrow">КОД СЕССИИ</div><div class="join-code">${escapeHtml(code)}</div><div class="classroom-warning"><span>i</span><p>Имя и отправленный ответ будут видны преподавателю и сохранятся в Firebase, пока занятие открыто.</p></div><form id="join-form"><label class="form-field"><span>ИМЯ ИЛИ ПСЕВДОНИМ</span><input name="student-name" required maxlength="30" autocomplete="nickname" placeholder="Например, Алексей" /></label><button class="button button-primary button-full">ПОДКЛЮЧИТЬСЯ <span>→</span></button></form><button class="text-button" data-action="leave-join">← К АРХИВУ</button></div>`;
}
function resultsPage() {
  const attempts = progress.attempts;
  return `${pageHeading("АРХИВНЫЙ ЖУРНАЛ", "Результаты", "История попыток и учебный прогресс, сохранённые только в этом браузере.")}
    <div class="results-summary"><div class="stat-card"><span>ПОПЫТКИ</span><strong>${String(attempts.length).padStart(2, "0")}</strong><small>Тесты на этом устройстве</small></div><div class="stat-card"><span>ТЕМЫ ИЗУЧЕНЫ</span><strong>${String(progress.completed.length).padStart(2, "0")}<em> / 06</em></strong><small>Можно отметить в карточке темы</small></div><div class="stat-card"><span>ИЗБРАННОЕ</span><strong>${String(progress.favorites.length).padStart(2, "0")}</strong><small>Сохранённые модули</small></div></div>
    <div class="panel results-panel"><div class="panel-heading"><div><div class="eyebrow">ИСТОРИЯ ПОПЫТОК</div><h3>Ваши тесты</h3></div><span class="mono muted">${attempts.length} ЗАПИСЕЙ</span></div>${attempts.length ? `    <div class="attempt-table"><div class="attempt-head"><span>ТЕМА / УРОВЕНЬ</span><span>ДАТА</span><span>РЕЗУЛЬТАТ</span></div>${attempts.map((attempt) => `<div class="attempt-row"><strong>${escapeHtml(attempt.moduleTitle)}<small>Уровень ${attempt.tier}${attempt.variant ? ` · вариант ${escapeHtml(attempt.variant)}` : ""}${attempt.manualTotal ? ` · открытых ответов для самопроверки: ${attempt.manualTotal}` : ""}</small></strong><span>${escapeHtml(attempt.date)}</span><b>${attempt.score} / ${attempt.total}</b></div>`).join("")}</div><div class="results-actions"><button class="button button-outline button-small" data-action="export-csv">ВЫГРУЗИТЬ CSV</button><button class="button button-quiet button-small" data-action="print">ПЕЧАТЬ</button></div>` : `<div class="empty-state"><span class="empty-glyph">∅</span><strong>Результатов пока нет</strong><small>Пройдите тест, чтобы сохранить первую попытку.</small><button class="button button-small" data-page="tests">Начать тестирование</button></div>`}</div><p class="footnote">Статистика отражает только реально сохранённые действия в текущем браузере; данные не отправляются преподавателю.</p>`;
}
function aboutPage() {
  return `${pageHeading("О ПРОЕКТЕ", "История — это работа с данными", "HISTORY://2077 — учебная среда для изучения истории Руси и становления Российского государства.")}
    <div class="about-grid"><section class="panel about-story"><div class="eyebrow">КОНЦЕПЦИЯ</div><h2>Архив, который нужно читать критически</h2><p>В художественном сценарии 2077 года исследователь восстанавливает повреждённые записи цифрового архива. В учебной части вместо выдуманных цитат используются краткие материалы, вопросы, хронологии и оговорки о характере источников.</p><p>Цель платформы — не заменить учебник, а научить замечать разницу между датой, летописным сообщением, поздней традицией и исторической интерпретацией.</p><div class="author-card"><span class="author-mark">A</span><div><div class="eyebrow">АВТОР ПРОЕКТА</div><strong>Рябчук Иван Андреевич</strong></div></div></section><section class="panel"><div class="eyebrow">ПРИНЦИПЫ</div><div class="principle-list"><div><span>01</span><strong>Проверяемость</strong><p>Для тем указаны письменные памятники и ограничения их использования.</p></div><div><span>02</span><strong>Контекст</strong><p>Даты с оговоркой не выдаются за бесспорную точность.</p></div><div><span>03</span><strong>Разные уровни</strong><p>От воспроизведения фактов до анализа свидетельств.</p></div></div></section><section class="panel about-sources"><div class="eyebrow">ИСПОЛЬЗОВАННЫЕ ИСТОЧНИКИ / ОРИЕНТИРЫ</div><h3>Для дальнейшего чтения</h3><ul class="source-list"><li>«Повесть временных лет»: летописное повествование в составе Лаврентьевского и Ипатьевского списков.</li><li>«Русская Правда»: Краткая и Пространная редакции — тексты древнерусского права.</li><li>Иларион. «Слово о законе и благодати» — памятник древнерусской книжности.</li><li>«Слово о полку Игореве» и летописные рассказы о походе 1185 года.</li><li>Судебник 1497 года — памятник права эпохи Ивана III.</li></ul><p class="footnote">Списки летописей и правовых памятников создавались в разное время; названия памятников не означают, что дошедшая рукопись является оригиналом описываемого периода.</p></section></div>`;
}
function settingsPage() {
  return `${pageHeading("ПЕРСОНАЛЬНЫЙ ПРОФИЛЬ", "Настройки", "Имя используется только в локальном интерфейсе. Регистрация не требуется.")}
    <div class="settings-grid"><section class="panel"><div class="eyebrow">ПРОФИЛЬ НА ЭТОМ УСТРОЙСТВЕ</div><h3>Исследователь</h3><form id="profile-form"><label class="form-field"><span>ИМЯ ИЛИ ПСЕВДОНИМ</span><input name="nickname" maxlength="30" value="${escapeHtml(progress.nickname)}" placeholder="Исследователь" /></label><button class="button button-primary">СОХРАНИТЬ</button></form><div class="setting-row"><div><strong>Локальное сохранение</strong><small>Прогресс остаётся в этом браузере.</small></div><span class="status-chip">ВКЛЮЧЕНО</span></div></section><section class="panel"><div class="eyebrow">ДАННЫЕ И ПРИВАТНОСТЬ</div><h3>Управление локальными данными</h3><p class="small-copy">Очистка удаляет только сохранённый прогресс, результаты, команды и баллы на этом устройстве. Файлы сайта не затрагиваются.</p><button class="button button-danger" data-action="clear-all-data">ОЧИСТИТЬ ВСЕ ДАННЫЕ</button></section></div>`;
}
function render() {
  let content;
  if (state.page === "home") content = homePage();
  else if (state.page === "archive") content = archivePage();
  else if (state.page === "module") content = modulePage();
  else if (state.page === "quiz-games") content = quizGamesPage();
  else if (state.page === "tests") content = testsPage();
  else if (state.page === "crossword") content = crosswordPage();
  else if (state.page === "games") content = gamesPage();
  else if (state.page === "classroom") content = classroomPage();
  else if (state.page === "results") content = resultsPage();
  else if (state.page === "about") content = aboutPage();
  else content = settingsPage();
  shell(content);
  if (state.page === "classroom" && state.classroom?.role === "teacher") generateQr(state.classroom.url);
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function toast(message) {
  const region = root.querySelector(".toast-region");
  if (!region) return;
  region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  setTimeout(() => { if (region) region.innerHTML = ""; }, 3200);
}
function saveAttempt(moduleId, tier, score, total, manualTotal = 0) {
  const item = modules.find((m) => m.id === moduleId);
  progress.attempts.unshift({ moduleId, moduleTitle: item.title, tier, variant: state.quizVariant, score, total, manualTotal, date: new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date()) });
  progress.attempts = progress.attempts.slice(0, 50);
  saveProgress();
}
function submitLiveScore(score, total) {
  const session = state.classroom;
  if (session?.role !== "student" || !["test", "test-2", "crossword", "game"].includes(session.currentActivity)) return;
  const result = {
    activity: session.currentActivity,
    score,
    total,
    text: `Автопроверка: ${score} из ${total}`
  };
  import("./firebase-classroom.js")
    .then(({ submitClassroomResult }) => submitClassroomResult(session.code, session.uid, result))
    .then(() => {
      if (state.classroom === session) {
        session.response = { ...result, submittedAt: Date.now() };
        toast("Результат отправлен преподавателю.");
      }
    })
    .catch((error) => toast(classroomErrorText(error)));
}
function quizSubmit(form) {
  const moduleId = form.dataset.module;
  const tier = Number(form.dataset.tier);
  const questions = state.quizQuestionSet || modules.find((m) => m.id === moduleId).questions.filter((q) => q.tier === tier);
  let score = 0;
  questions.forEach((question, index) => {
    const article = form.querySelector(`[data-question="${index}"]`);
    const feedback = article.querySelector(".question-feedback");
    let correct = false;
    if (question.type === "choice" || question.type === "source-choice") {
      const selected = form.querySelector(`input[name="q-${index}"]:checked`);
      correct = Boolean(selected && Number(selected.value) === question.answer);
    } else if (question.type === "order") {
      const order = question.options.map((_, i) => Number(form.querySelector(`[name="q-${index}-${i}"]`).value));
      correct = order.every((value, i) => Number.isInteger(value) && value === question.answer.indexOf(question.options[i])) && new Set(order).size === order.length;
    } else {
      const answer = normalize(form.querySelector(`[name="q-${index}"]`).value);
      if (question.type === "source") {
        feedback.hidden = false;
        feedback.className = "question-feedback manual-review";
        feedback.innerHTML = `<strong>САМОПРОВЕРКА</strong><span>Вопрос с открытым ответом не оценивается автоматически. Сверьте ответ с ориентиром: ${escapeHtml(question.explain)}</span>`;
        article.classList.add("answered-manual");
        return;
      }
      correct = Boolean(answer && question.answer.some((keyword) => answer.includes(normalize(keyword))));
    }
    if (correct) score++;
    feedback.hidden = false;
    feedback.className = `question-feedback ${correct ? "correct" : "incorrect"}`;
    feedback.innerHTML = `<strong>${correct ? "ВЕРНО" : "ЕСТЬ НЕТОЧНОСТЬ"}</strong><span>${escapeHtml(question.explain)}</span>`;
    article.classList.toggle("answered-correct", correct);
    article.classList.toggle("answered-incorrect", !correct);
  });
  const automaticTotal = questions.filter((question) => question.type !== "source").length;
  const manualTotal = questions.length - automaticTotal;
  saveAttempt(moduleId, tier, score, automaticTotal, manualTotal);
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = `АВТОПРОВЕРКА: ${score} / ${automaticTotal}`;
  toast(`Сохранено локально: автопроверка ${score}/${automaticTotal}${manualTotal ? `; открытых ответов для самопроверки: ${manualTotal}` : ""}.`);
  if (state.classroom?.currentActivity === state.classroom.meta?.workId && ["test", "test-2"].includes(state.classroom.currentActivity)) {
    submitLiveScore(score, automaticTotal);
  }
}
function checkCrossword(form) {
  const item = modules.find((m) => m.id === form.dataset.module);
  let score = 0;
  item.crossword.forEach(([answer], i) => {
    const cells = form.querySelectorAll(`[name^="clue-${i}-"]`);
    const value = Array.from(cells, (cell) => cell.value).join("");
    const correct = normalize(value) === normalize(answer);
    if (correct) score++;
    cells.forEach((cell) => {
      cell.classList.toggle("input-correct", correct);
      cell.classList.toggle("input-incorrect", !correct);
    });
    const mark = root.querySelector(`#clue-mark-${i}`);
    mark.textContent = correct ? "✓" : "×";
    mark.className = `clue-mark ${correct ? "correct-text" : "incorrect-text"}`;
  });
  const result = root.querySelector("#crossword-result");
  result.innerHTML = `<strong>${score === item.crossword.length ? "ОТЛИЧНО — ВСЕ СЛОВА НАЙДЕНЫ" : `НАЙДЕНО ${score} ИЗ ${item.crossword.length}`}</strong><span>${score === item.crossword.length ? "Тема закреплена." : "Исправьте отмеченные ответы и проверьте ещё раз."}</span>`;
  submitLiveScore(score, item.crossword.length);
}
function checkChronology() {
  const item = currentModule();
  const events = item.timeline.slice(0, 5);
  const expected = [...state.gameOrder].sort((a, b) => yearValue(events[a][0]) - yearValue(events[b][0]));
  const score = state.gameOrder.filter((event, i) => event === expected[i]).length;
  state.gameScore = score;
  root.querySelector("#game-feedback").innerHTML = `<div class="feedback-box ${score === expected.length ? "correct" : "incorrect"}"><strong>${score === expected.length ? "ХРОНОЛОГИЯ ВОССТАНОВЛЕНА" : `СОВПАДЕНИЙ: ${score} / ${expected.length}`}</strong><p>${events.map(([date, text]) => `<span><b>${escapeHtml(date)}</b> ${escapeHtml(text)}</span>`).join("")}</p></div>`;
  submitLiveScore(score, expected.length);
}
function yearValue(date) {
  const match = String(date).match(/\d{3,4}/);
  return match ? Number(match[0]) : 9999;
}
async function generateQr(url) {
  const note = root.querySelector("#qr-note");
  const canvas = root.querySelector("#qr-canvas");
  if (!note || !canvas) return;
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
    const QRCode = module.default;
    await QRCode.toCanvas(canvas, url, { width: 220, margin: 1, color: { dark: "#080a12", light: "#ffffff" }, errorCorrectionLevel: "M" });
    note.textContent = "QR СГЕНЕРИРОВАН В БРАУЗЕРЕ";
  } catch {
    note.textContent = "QR недоступен без подключения к библиотеке. Используйте ссылку и код.";
  }
}
function downloadQr() {
  const canvas = root.querySelector("#qr-canvas");
  if (!canvas) return toast("QR-код пока не создан.");
  const link = document.createElement("a");
  link.download = `history2077-${state.classroom.code}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
function exportCsv() {
  const rows = [["Тема", "Уровень", "Вариант", "Результат", "Всего", "Дата"], ...progress.attempts.map((a) => [a.moduleTitle, a.tier, a.variant || "", a.score, a.total, a.date])];
  const csv = "\uFEFF" + rows.map((row) => row.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "history2077-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}
root.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.page) {
    event.preventDefault();
    setPage(target.dataset.page, { moduleId: target.dataset.module, tier: target.dataset.tier ? Number(target.dataset.tier) : undefined, gameId: target.dataset.game });
    return;
  }
  if (target.dataset.module) {
    state.moduleId = target.dataset.module;
    if (target.dataset.tier) state.tier = Number(target.dataset.tier);
    if (target.dataset.game) {
      state.gameId = target.dataset.game;
      state.page = "games";
    } else state.page = "module";
    render();
    return;
  }
  if (target.dataset.tier) {
    state.tier = Number(target.dataset.tier);
    render();
    return;
  }
  if (target.dataset.quizQuestion) {
    const board = quizBoardState(quizProgress.selectedGameId);
    if (!board.activeQuestionId && !board.completedQuestions.includes(target.dataset.quizQuestion)) {
      board.activeQuestionId = target.dataset.quizQuestion;
      board.answerRevealed = false;
      saveQuizProgress();
      render();
    }
    return;
  }
  if (target.dataset.gameMove !== undefined) {
    const from = Number(target.dataset.gameMove);
    const to = from + Number(target.dataset.direction);
    if (to >= 0 && to < state.gameOrder.length) [state.gameOrder[from], state.gameOrder[to]] = [state.gameOrder[to], state.gameOrder[from]];
    render();
    return;
  }
  const action = target.dataset.action;
  if (action === "toggle-menu") root.querySelector(".sidebar")?.classList.toggle("open");
  if (action === "start-classroom-work" && state.classroom?.role === "student") {
    const { meta } = state.classroom;
    state.classroom.currentActivity = meta.workId;
    if (meta.workId === "test" || meta.workId === "test-2") {
      setPage("tests", { moduleId: meta.moduleId, tier: meta.workId === "test-2" ? 2 : 1 });
    } else if (meta.workId === "crossword") {
      setPage("crossword", { moduleId: meta.moduleId });
    } else if (meta.workId === "game") {
      const item = modules.find((module) => module.id === meta.moduleId);
      setPage("games", { moduleId: meta.moduleId, gameId: item.game });
    }
    return;
  }
  if (action === "teacher-signout") {
    try {
      const { signOutTeacher } = await import("./firebase-classroom.js");
      await signOutTeacher();
      stopClassroomWatch();
      state.teacher = null;
      state.classroom = null;
      render();
      toast("Вы вышли из аккаунта преподавателя.");
    } catch (error) {
      toast(classroomErrorText(error));
    }
  }
  if (action === "add-quiz-team") {
    const board = quizBoardState(quizProgress.selectedGameId);
    if (board.teams.length < 6) {
      const number = board.teams.length + 1;
      board.teams.push({ id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: `Команда ${number}`, score: 0 });
      saveQuizProgress();
      render();
    }
  }
  if (action === "reveal-quiz-answer") {
    const board = quizBoardState(quizProgress.selectedGameId);
    if (board.activeQuestionId) {
      board.answerRevealed = true;
      saveQuizProgress();
      render();
    }
  }
  if (action === "award-quiz-points") {
    const game = quizGames.find((item) => item.id === quizProgress.selectedGameId);
    const board = quizBoardState(quizProgress.selectedGameId);
    const question = game.categories.flatMap((category) => category.questions).find((item) => item.id === board.activeQuestionId);
    const team = board.teams.find((item) => item.id === target.dataset.teamId);
    if (question && team && board.answerRevealed) {
      team.score += question.points;
      board.completedQuestions.push(question.id);
      board.history.unshift({ teamName: team.name, question: question.prompt, points: question.points });
      board.history = board.history.slice(0, 25);
      board.activeQuestionId = "";
      board.answerRevealed = false;
      saveQuizProgress();
      render();
    }
  }
  if (action === "skip-quiz-question") {
    const game = quizGames.find((item) => item.id === quizProgress.selectedGameId);
    const board = quizBoardState(quizProgress.selectedGameId);
    const question = game.categories.flatMap((category) => category.questions).find((item) => item.id === board.activeQuestionId);
    if (question && board.answerRevealed) {
      board.completedQuestions.push(question.id);
      board.history.unshift({ teamName: "Снят без баллов", question: question.prompt, points: 0 });
      board.history = board.history.slice(0, 25);
      board.activeQuestionId = "";
      board.answerRevealed = false;
      saveQuizProgress();
      render();
    }
  }
  if (action === "favorite") {
    const id = target.dataset.id;
    progress.favorites = progress.favorites.includes(id) ? progress.favorites.filter((entry) => entry !== id) : [...progress.favorites, id];
    saveProgress(); render();
  }
  if (action === "mark-complete") {
    const id = target.dataset.id;
    progress.completed = progress.completed.includes(id) ? progress.completed.filter((entry) => entry !== id) : [...progress.completed, id];
    saveProgress(); render();
  }
  if (action === "exit-game") { state.gameId = null; render(); }
  if (action === "restart-game") { state.gameStep = 0; state.gameScore = 0; state.gameOrder = []; state.gameAnswers = {}; render(); }
  if (action === "check-chronology") checkChronology();
  if (action === "check-claims") {
    const incorrectIndexes = [2, 4];
    let score = 0;
    incorrectIndexes.forEach((index) => {
      const checked = root.querySelector(`[name="claim-${index}"]`).checked;
      const mark = root.querySelector(`#claim-result-${index}`);
      mark.textContent = checked ? "✓" : "×";
      mark.className = `claim-result ${checked ? "correct-text" : "incorrect-text"}`;
      if (checked) score++;
    });
    [0, 1, 3].forEach((index) => {
      const checked = root.querySelector(`[name="claim-${index}"]`).checked;
      const mark = root.querySelector(`#claim-result-${index}`);
      mark.textContent = checked ? "×" : "✓";
      mark.className = `claim-result ${checked ? "incorrect-text" : "correct-text"}`;
    });
    state.gameScore = score;
    root.querySelector("#game-feedback").innerHTML = `<div class="feedback-box ${score === 2 ? "correct" : "incorrect"}"><strong>НАЙДЕНО ОШИБОК: ${score} / 2</strong><p>Русская Правда не могла быть напечатана в XI веке; утверждение о наследственной монархии современного типа — анахроничное обобщение.</p></div>`;
    submitLiveScore(score, 2);
  }
  if (action === "check-regions" || action === "check-moscow") {
    const isRegions = action === "check-regions";
    const expected = isRegions ? ["Новгородская земля", "Владимиро-Суздальская земля", "Галицко-Волынская земля"] : ["Иван I Калита", "Дмитрий Донской", "Иван III", "Василий III"];
    const name = isRegions ? "region" : "ruler";
    let score = 0;
    expected.forEach((answer, i) => {
      const input = root.querySelector(`[name="${name}-${i}"]`);
      const correct = input.value === answer;
      if (correct) score++;
      input.classList.toggle("input-correct", correct);
      input.classList.toggle("input-incorrect", !correct);
    });
    state.gameScore = score;
    const feedback = root.querySelector("#game-feedback");
    feedback.innerHTML = `<div class="feedback-box ${score === expected.length ? "correct" : "incorrect"}"><strong>ВЕРНЫХ СОПОСТАВЛЕНИЙ: ${score} / ${expected.length}</strong><p>${isRegions ? "Новгород — вечевые институты; Владимиро-Суздальская земля — северо-восточный центр; Галицко-Волынская земля — юго-запад." : "Иван I Калита — укрепление Москвы; Дмитрий Донской — Куликовская битва; Иван III — Новгород, Судебник и Угра; Василий III — продолжение объединения."}</p></div>`;
    submitLiveScore(score, expected.length);
  }
  if (action === "check-decisions") {
    const correctOrder = [0, 1, 2, 3];
    const score = state.gameOrder.filter((value, index) => value === correctOrder[index]).length;
    state.gameScore = score;
    root.querySelector("#game-feedback").innerHTML = `<div class="feedback-box ${score === 4 ? "correct" : "incorrect"}"><strong>СОВПАДЕНИЙ: ${score} / 4</strong><p>Хронология: Калка (1223), начало похода (1237), южные походы и взятие Киева (1239–1240), затем становление системы зависимости и дани. Последовательность не означает, что все земли пережили события одинаково.</p></div>`;
    submitLiveScore(score, 4);
  }
  if (action === "crossword-reset") {
    root.querySelector("#crossword-form").reset();
    root.querySelectorAll(".clue-mark").forEach((mark) => { mark.textContent = "—"; mark.className = "clue-mark"; });
    root.querySelector("#crossword-result").innerHTML = "";
    root.querySelectorAll(".clue-row input").forEach((input) => input.classList.remove("input-correct", "input-incorrect"));
  }
  if (action === "copy-link" && state.classroom) {
    try { await navigator.clipboard.writeText(state.classroom.url); toast("Ссылка скопирована."); }
    catch { toast(state.classroom.url); }
  }
  if (action === "download-qr") downloadQr();
  if (action === "close-session" && state.classroom?.role === "teacher") {
    try {
      const { closeClassroom } = await import("./firebase-classroom.js");
      await closeClassroom(state.classroom.code);
      state.classroom.meta.status = "closed";
      render();
      toast("Занятие закрыто.");
    } catch (error) {
      toast(classroomErrorText(error));
    }
  }
  if (action === "leave-join") {
    stopClassroomWatch();
    state.classroom = null;
    state.joining = false;
    state.joinCode = "";
    history.replaceState({}, "", location.pathname);
    setPage("home");
  }
  if (action === "export-csv") exportCsv();
  if (action === "print") window.print();
  if (action === "clear-all-data") clearAllData();
});
root.addEventListener("input", (event) => {
  if (event.target.name === "response" && state.classroom?.role === "student") {
    state.classroom.draft = event.target.value;
    return;
  }
  const cell = event.target.closest(".clue-cells input");
  if (!cell || !cell.value) return;
  const cells = [...cell.parentElement.querySelectorAll("input")];
  const next = cells[cells.indexOf(cell) + 1];
  if (next) next.focus();
});
root.addEventListener("keydown", (event) => {
  const cell = event.target.closest(".clue-cells input");
  if (!cell || event.key !== "Backspace" || cell.value) return;
  const cells = [...cell.parentElement.querySelectorAll("input")];
  const previous = cells[cells.indexOf(cell) - 1];
  if (previous) previous.focus();
});
root.addEventListener("change", (event) => {
  if (event.target.id === "quiz-game-select") {
    quizProgress.selectedGameId = event.target.value;
    saveQuizProgress();
    render();
    return;
  }
  if (event.target.dataset.teamName) {
    const board = quizBoardState(quizProgress.selectedGameId);
    const team = board.teams.find((item) => item.id === event.target.dataset.teamName);
    if (team) {
      team.name = event.target.value.trim() || `Команда ${board.teams.indexOf(team) + 1}`;
      saveQuizProgress();
    }
    return;
  }
  if (event.target.id === "test-module" || event.target.id === "crossword-module") {
    state.moduleId = event.target.value;
    state.quizAnswers = {};
    render();
  }
});
root.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "quiz-form") quizSubmit(form);
  if (form.id === "crossword-form") checkCrossword(form);
  if (form.id === "profile-form") {
    progress.nickname = form.elements.nickname.value.trim();
    saveProgress(); render(); toast("Профиль сохранён на этом устройстве.");
  }
  if (form.id === "teacher-login-form") {
    try {
      const { signInTeacher } = await import("./firebase-classroom.js");
      state.teacher = await signInTeacher(form.elements["teacher-email"].value, form.elements["teacher-password"].value);
      stopClassroomWatch();
      if (state.classroom?.role === "teacher") await watchCurrentClassroom();
      else if (!state.classroom) resumeStoredClassroom();
      render();
      toast("Вход выполнен.");
    } catch (error) {
      toast(classroomErrorText(error));
    }
    return;
  }
  if (form.id === "session-form") {
    const module = modules.find((item) => item.id === form.elements["session-module"].value);
    const work = form.elements["session-work"];
    try {
      const { createClassroom } = await import("./firebase-classroom.js");
      const session = await createClassroom({
        title: form.elements["session-title"].value.trim(),
        moduleId: module.id,
        moduleTitle: module.title,
        workId: work.value,
        workLabel: work.options[work.selectedIndex].text
      });
      const url = `${location.origin}${location.pathname}?join=${session.code}`;
      state.classroom = { ...session, role: "teacher", url, participants: {}, responses: {} };
      let successMessage = "Занятие создано. Поделитесь кодом или QR-ссылкой.";
      try {
        localStorage.setItem(LIVE_KEY, JSON.stringify({ code: session.code, uid: session.uid, url }));
      } catch {
        successMessage = "Занятие создано, но этот браузер не сможет восстановить его после закрытия.";
      }
      await watchCurrentClassroom();
      render();
      toast(successMessage);
    } catch (error) {
      toast(classroomErrorText(error));
    }
    return;
  }
  if (form.id === "join-form") {
    try {
      const { joinClassroom } = await import("./firebase-classroom.js");
      const name = form.elements["student-name"].value.trim();
      const joined = await joinClassroom(state.joinCode.toUpperCase(), name);
      state.classroom = {
        ...joined,
        role: "student",
        code: state.joinCode.toUpperCase(),
        name,
        draft: ""
      };
      state.joining = true;
      await watchCurrentClassroom();
      render();
    } catch (error) {
      toast(classroomErrorText(error));
    }
    return;
  }
  if (form.id === "response-form") {
    const text = form.elements.response.value.trim();
    try {
      const { submitResponse } = await import("./firebase-classroom.js");
      await submitResponse(state.classroom.code, state.classroom.uid, text);
      state.classroom.response = { text, submittedAt: Date.now() };
      state.classroom.draft = text;
      render();
      toast("Ответ отправлен преподавателю.");
    } catch (error) {
      toast(classroomErrorText(error));
    }
  }
});
root.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-game-choice]");
  if (!choice || !state.gameId) return;
  const stages = [
    { correct: 0, feedback: "Русь приняла христианство византийского обряда." },
    { correct: 0, feedback: "Корсунь — средневековое название Херсонеса." },
    { correct: 0, feedback: "Христианизация была постепенным процессом." }
  ];
  const stage = stages[state.gameStep];
  const correct = Number(choice.dataset.gameChoice) === stage.correct;
  if (correct) state.gameScore++;
  const feedback = root.querySelector("#game-feedback");
  feedback.innerHTML = `<div class="feedback-box ${correct ? "correct" : "incorrect"}"><strong>${correct ? "ВЕРНО" : "ПРОВЕРЬТЕ СВИДЕТЕЛЬСТВО"}</strong><p>${stage.feedback}</p><button class="button button-small" data-action="next-quest">${state.gameStep === 2 ? "ЗАВЕРШИТЬ" : "СЛЕДУЮЩИЙ ЭТАП"} →</button></div>`;
  root.querySelectorAll("[data-game-choice]").forEach((button) => { button.disabled = true; });
});
root.addEventListener("click", (event) => {
  if (event.target.closest("[data-action='next-quest']")) {
    const finished = state.gameStep === 2;
    state.gameStep++;
    if (finished) submitLiveScore(state.gameScore, 3);
    render();
  }
});
render();

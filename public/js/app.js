"use strict";

const THEME_STORAGE_KEY = "taskManagerTheme";
const TASKS_API_URL = "/api/tasks";
const VALID_PRIORITIES = ["low", "medium", "high"];
const MAX_TITLE_LENGTH = 80;

let tasks = [];
let currentFilter = "all";
let currentNavView = "my-day";
let searchTerm = "";
let editingTaskId = null;
let currentModalStep = 1;
let currentTheme = "light";
let sidebarCollapsed = window.matchMedia("(max-width: 900px)").matches;
let pendingDeleteId = null;
let toastTimer = null;

/* ─── DOM References ──────────────────────────────────────────────────────── */
const appShell = document.getElementById("app-shell");
const taskRegion = document.getElementById("task-region");
const sidebar = document.getElementById("sidebar");
const menuButton = document.getElementById("menu-button");
const themeToggleButton = document.getElementById("theme-toggle-button");
const navButtons = document.querySelectorAll(".nav-item");
const pageTitle = document.getElementById("page-title");
const todayLabel = document.getElementById("today-label");
const taskForm = document.getElementById("task-form");
const taskModal = document.getElementById("task-modal");
const openModalButton = document.getElementById("open-modal-button");
const closeModalButton = document.getElementById("close-modal-button");
const titleInput = document.getElementById("task-title");
const titleError = document.getElementById("title-error");
const charCount = document.getElementById("char-count");
const startDateInput = document.getElementById("task-start-date");
const endDateInput = document.getElementById("task-end-date");
const dateError = document.getElementById("date-error");
const priorityRadios = document.querySelectorAll('input[name="taskPriority"]');
const priorityOptions = document.querySelectorAll(".priority-option");
const submitButton = document.getElementById("submit-button");
const nextButton = document.getElementById("next-button");
const backButton = document.getElementById("back-button");
const searchInput = document.getElementById("search-input");
const filterButtons = document.querySelectorAll(".filter-button");
const clearCompletedButton = document.getElementById("clear-completed-button");
const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const modalTitle = document.getElementById("modal-title");
const modalStepLabel = document.getElementById("modal-step-label");
const stepPanels = document.querySelectorAll(".modal-step");
const stepDots = document.querySelectorAll(".step-dot");
const navTotalCount = document.getElementById("nav-total-count");
const navActiveCount = document.getElementById("nav-active-count");
const navCompletedCount = document.getElementById("nav-completed-count");
const toast = document.getElementById("toast");
const confirmDialog = document.getElementById("confirm-dialog");
const confirmDesc = document.getElementById("confirm-desc");
const confirmDeleteBtn = document.getElementById("confirm-delete");
const confirmCancelBtn = document.getElementById("confirm-cancel");

/* ─── Toast ───────────────────────────────────────────────────────────────── */
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
        toastTimer = null;
    }, 2600);
}

/* ─── Confirm Dialog ──────────────────────────────────────────────────────── */
function openConfirmDialog(taskId, taskTitle) {
    pendingDeleteId = taskId;
    confirmDesc.textContent = `"${taskTitle}" will be permanently removed.`;
    confirmDialog.hidden = false;
    confirmDeleteBtn.focus();
}

function closeConfirmDialog() {
    confirmDialog.hidden = true;
    pendingDeleteId = null;
}

/* ─── Persistence ─────────────────────────────────────────────────────────── */
function normalizeTask(task) {
    return {
        ...task,
        title: String(task.title || "").trim().slice(0, MAX_TITLE_LENGTH),
        completed: Boolean(task.completed),
        priority: VALID_PRIORITIES.includes(task.priority) ? task.priority : "medium",
        startDate: task.startDate || "",
        endDate: task.endDate || task.dueDate || "",
        dueDate: task.endDate || task.dueDate || "",
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || null
    };
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const data = response.status === 204 ? null : await response.json();

    if (!response.ok) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
    }

    return data;
}

async function getTasks() {
    const data = await requestJson(TASKS_API_URL);
    return Array.isArray(data) ? data.map(normalizeTask) : [];
}

async function createTask(data) {
    return normalizeTask(await requestJson(TASKS_API_URL, {
        method: "POST",
        body: JSON.stringify(data)
    }));
}

async function updateTask(id, data) {
    return normalizeTask(await requestJson(`${TASKS_API_URL}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(data)
    }));
}

async function deleteTaskById(id) {
    await requestJson(`${TASKS_API_URL}/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });
}

async function loadTasks() {
    try {
        tasks = await getTasks();
    } catch (error) {
        console.error("Could not load tasks from the backend.", error);
        tasks = [];
        showToast("Could not load tasks. Please check the server.");
    }
}

/* ─── Theme ───────────────────────────────────────────────────────────────── */
function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    currentTheme = savedTheme === "dark" ? "dark" : "light";
}

function saveTheme() {
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
}

function updateGlassTheme() {
    document.documentElement.setAttribute("data-theme", currentTheme);
    themeToggleButton.textContent = currentTheme === "dark" ? "☀" : "☾";
    themeToggleButton.setAttribute(
        "aria-label",
        currentTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
}

function toggleTheme() {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    saveTheme();
    updateGlassTheme();
}

/* ─── Task Helpers ────────────────────────────────────────────────────────── */
function formatDueDate(dateString) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function getTodayDateString() {
    const today = new Date();
    const timezoneOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function isTaskDueToday(task) {
    return getTaskEndDate(task) === getTodayDateString();
}

function isTaskOverdue(task) {
    const endDate = getTaskEndDate(task);
    return Boolean(endDate && endDate < getTodayDateString() && !task.completed);
}

function getTaskStartDate(task) {
    return task.startDate || "";
}

function getTaskEndDate(task) {
    return task.endDate || task.dueDate || "";
}

function getTaskDateLabel(task) {
    const startDate = getTaskStartDate(task);
    const endDate = getTaskEndDate(task);

    if (startDate && endDate) return `${formatDueDate(startDate)} → ${formatDueDate(endDate)}`;
    if (startDate) return `Starts ${formatDueDate(startDate)}`;
    if (endDate) return `Due ${formatDueDate(endDate)}`;
    return "";
}

function hasTaskDate(task) {
    return Boolean(getTaskStartDate(task) || getTaskEndDate(task));
}

/* ─── Filtering / Sorting ─────────────────────────────────────────────────── */
function getVisibleTasks() {
    return tasks
        .filter((task) => {
            const taskPriority = VALID_PRIORITIES.includes(task.priority) ? task.priority : "medium";
            const matchesNavView =
                (currentNavView === "my-day" && isTaskDueToday(task)) ||
                currentNavView === "all-tasks" ||
                (currentNavView === "important" && taskPriority === "high") ||
                (currentNavView === "planned" && hasTaskDate(task)) ||
                (currentNavView === "completed" && task.completed);

            const matchesFilter =
                currentFilter === "all" ||
                (currentFilter === "active" && !task.completed) ||
                (currentFilter === "completed" && task.completed);

            const matchesSearch = task.title.toLowerCase().includes(searchTerm);

            return matchesNavView && matchesFilter && matchesSearch;
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* ─── CRUD ────────────────────────────────────────────────────────────────── */
async function addTask(title, startDate, endDate, priority) {
    try {
        const newTask = await createTask({ title, startDate, endDate, priority });
        tasks.unshift(newTask);
        renderTasks();
        showToast("Task saved");
        return true;
    } catch (error) {
        console.error("Could not save task.", error);
        showToast(error.message);
        return false;
    }
}

function deleteTask(taskId) {
    const taskToDelete = tasks.find((task) => task.id === taskId);

    if (!taskToDelete) return;

    openConfirmDialog(taskId, taskToDelete.title);
}

async function commitDelete(taskId) {
    const taskItem = taskList.querySelector(`[data-task-id="${taskId}"]`);

    try {
        await deleteTaskById(taskId);
        tasks = tasks.filter((task) => task.id !== taskId);

        if (editingTaskId === taskId) closeTaskModal();

        if (taskItem) {
            taskItem.classList.add("is-removing");
            taskItem.addEventListener("animationend", () => {
                renderTasks();
                showToast("Task deleted");
            }, { once: true });
        } else {
            renderTasks();
            showToast("Task deleted");
        }
    } catch (error) {
        console.error("Could not delete task.", error);
        showToast(error.message);
    }
}

async function editTask(taskId, updatedValues) {
    try {
        const savedTask = await updateTask(taskId, updatedValues);

        tasks = tasks.map((task) => task.id === taskId ? savedTask : task);
        renderTasks();
        showToast("Task updated");
        return true;
    } catch (error) {
        console.error("Could not update task.", error);
        showToast(error.message);
        return false;
    }
}

async function toggleComplete(taskId) {
    const taskToUpdate = tasks.find((task) => task.id === taskId);

    if (!taskToUpdate) return;

    try {
        const savedTask = await updateTask(taskId, {
            ...taskToUpdate,
            completed: !taskToUpdate.completed
        });

        tasks = tasks.map((task) => task.id === taskId ? savedTask : task);
        renderTasks();
    } catch (error) {
        console.error("Could not update task status.", error);
        showToast(error.message);
        renderTasks();
    }
}

async function clearCompletedTasks() {
    const completedCount = tasks.filter((task) => task.completed).length;

    if (completedCount === 0) return;

    try {
        const completedTasks = tasks.filter((task) => task.completed);
        await Promise.all(completedTasks.map((task) => deleteTaskById(task.id)));

        tasks = tasks.filter((task) => !task.completed);
        renderTasks();
        showToast(`Cleared ${completedCount} completed task${completedCount === 1 ? "" : "s"}`);
    } catch (error) {
        console.error("Could not clear completed tasks.", error);
        showToast(error.message);
    }
}

/* ─── View Utilities ──────────────────────────────────────────────────────── */
function filterTasks(filterValue) {
    currentFilter = filterValue;
    renderTasks();
}

function searchTasks(value) {
    searchTerm = value.trim().toLowerCase();
    renderTasks();
}

function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    applySidebarState();
}

function setNavView(view) {
    currentNavView = view;
    renderTasks();
}

/* ─── Modal ───────────────────────────────────────────────────────────────── */
function openTaskModal() {
    taskModal.hidden = false;
    taskModal.classList.add("is-open");
    clearTitleError();
    clearDateError();
    syncDateBounds();
    updatePriorityCards();
    updateModalStep();
}

function closeTaskModal() {
    taskModal.classList.remove("is-open");
    taskModal.hidden = true;
    resetForm();
}

function nextModalStep() {
    if (!validateCurrentStep()) return;

    if (currentModalStep < 3) {
        currentModalStep += 1;
        updateModalStep();
    }
}

function previousModalStep() {
    if (currentModalStep > 1) {
        currentModalStep -= 1;
        updateModalStep();
    }
}

function updateModalStep() {
    stepPanels.forEach((panel) => {
        const panelStep = Number(panel.dataset.step);
        const isActive = panelStep === currentModalStep;

        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
    });

    // Update progress dots
    stepDots.forEach((dot) => {
        const dotStep = Number(dot.dataset.dot);
        dot.classList.toggle("is-active", dotStep === currentModalStep);
        dot.classList.toggle("is-done", dotStep < currentModalStep);
    });

    modalStepLabel.textContent = `Step ${currentModalStep} of 3`;
    modalTitle.textContent = editingTaskId ? "Edit task" : "Create a task";
    backButton.hidden = currentModalStep === 1;
    nextButton.hidden = currentModalStep === 3;
    submitButton.hidden = currentModalStep !== 3;
    submitButton.textContent = editingTaskId ? "Update Task" : "Save Task";

    if (currentModalStep === 1) {
        titleInput.focus();
    } else if (currentModalStep === 2) {
        startDateInput.focus();
        openDatePicker(startDateInput);
    } else {
        const checkedPriority = document.querySelector('input[name="taskPriority"]:checked');
        if (checkedPriority) checkedPriority.focus();
    }
}

/* ─── Nav / Summary Counts ────────────────────────────────────────────────── */
function updateNavigationCounts() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.completed).length;
    const activeTasks = totalTasks - completedTasks;

    navTotalCount.textContent = String(totalTasks);
    navActiveCount.textContent = String(activeTasks);
    navCompletedCount.textContent = String(completedTasks);
}

function getCurrentPageTitle() {
    const titles = {
        "my-day": "My Day",
        important: "Important",
        planned: "Planned",
        completed: "Completed",
        "all-tasks": "All Tasks"
    };

    return titles[currentNavView] || "My Day";
}

function getTodayLabel() {
    return new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
    });
}

/* ─── Validation ──────────────────────────────────────────────────────────── */
function showTitleError(message = "Please enter a task title.") {
    titleError.textContent = message;
    titleError.hidden = false;
    titleInput.classList.add("is-error");
    titleInput.setAttribute("aria-invalid", "true");
}

function clearTitleError() {
    titleError.hidden = true;
    titleInput.classList.remove("is-error");
    titleInput.removeAttribute("aria-invalid");
}

function showDateError(message = "End date cannot be earlier than start date.") {
    dateError.textContent = message;
    dateError.hidden = false;
    startDateInput.classList.add("is-error");
    endDateInput.classList.add("is-error");
    endDateInput.setAttribute("aria-invalid", "true");
}

function clearDateError() {
    dateError.hidden = true;
    startDateInput.classList.remove("is-error");
    endDateInput.classList.remove("is-error");
    endDateInput.removeAttribute("aria-invalid");
}

function validateDateRange() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (startDate && endDate && endDate < startDate) {
        showDateError();
        endDateInput.focus();
        return false;
    }

    clearDateError();
    return true;
}

function validateTitle() {
    const title = titleInput.value.trim();

    if (!title) {
        showTitleError();
        titleInput.focus();
        return false;
    }

    if (title.length > MAX_TITLE_LENGTH) {
        showTitleError(`Task title must be ${MAX_TITLE_LENGTH} characters or less.`);
        titleInput.focus();
        return false;
    }

    clearTitleError();
    return true;
}

function validateCurrentStep() {
    if (currentModalStep === 1) return validateTitle();
    if (currentModalStep === 2) return validateDateRange();
    return true;
}

/* ─── Priority ────────────────────────────────────────────────────────────── */
function getSelectedPriority() {
    const checkedPriority = document.querySelector('input[name="taskPriority"]:checked');
    const priority = checkedPriority ? checkedPriority.value : "medium";
    return VALID_PRIORITIES.includes(priority) ? priority : "medium";
}

function setSelectedPriority(priority) {
    const safePriority = VALID_PRIORITIES.includes(priority) ? priority : "medium";
    priorityRadios.forEach((radio) => {
        radio.checked = radio.value === safePriority;
    });
    updatePriorityCards();
}

function updatePriorityCards() {
    priorityOptions.forEach((option) => {
        const radio = option.querySelector('input[name="taskPriority"]');
        const isSelected = Boolean(radio && radio.checked);
        option.classList.toggle("is-selected", isSelected);
        option.setAttribute("aria-checked", String(isSelected));
    });
}

/* ─── Date Helpers ────────────────────────────────────────────────────────── */
function openDatePicker(input) {
    if (!input || typeof input.showPicker !== "function") return;

    try {
        input.showPicker();
    } catch (_) {
        // Some browsers only allow showPicker from direct user actions.
    }
}

function blockDateTyping(event) {
    const allowedKeys = ["Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

    if (allowedKeys.includes(event.key)) return;

    if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        event.currentTarget.value = "";
        syncDateBounds();
        clearDateError();
        return;
    }

    if (event.ctrlKey || event.metaKey) return;

    event.preventDefault();
}

function syncDateBounds() {
    if (startDateInput.value) {
        endDateInput.min = startDateInput.value;
    } else {
        endDateInput.removeAttribute("min");
    }

    if (startDateInput.value && endDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = "";
        showDateError("End date was cleared because it was before the start date.");
        return;
    }

    clearDateError();
}

/* ─── Form Management ─────────────────────────────────────────────────────── */
function populateEditForm(taskId) {
    const taskToEdit = tasks.find((task) => task.id === taskId);

    if (!taskToEdit) return;

    editingTaskId = taskId;
    titleInput.value = taskToEdit.title;
    startDateInput.value = getTaskStartDate(taskToEdit);
    endDateInput.value = getTaskEndDate(taskToEdit);
    setSelectedPriority(taskToEdit.priority);
    syncDateBounds();
    currentModalStep = 1;
    clearTitleError();
    clearDateError();
    updateCharCount();
    openTaskModal();
}

function resetForm() {
    taskForm.reset();
    startDateInput.value = "";
    endDateInput.value = "";
    endDateInput.removeAttribute("min");
    setSelectedPriority("medium");
    editingTaskId = null;
    currentModalStep = 1;
    clearTitleError();
    clearDateError();
    updateCharCount();
}

/* ─── Character Counter ───────────────────────────────────────────────────── */
function updateCharCount() {
    const len = titleInput.value.length;
    charCount.textContent = `${len} / ${MAX_TITLE_LENGTH}`;
    charCount.classList.toggle("is-near-limit", len >= 60 && len < MAX_TITLE_LENGTH);
    charCount.classList.toggle("is-at-limit", len >= MAX_TITLE_LENGTH);
}

/* ─── Sidebar ─────────────────────────────────────────────────────────────── */
function applySidebarState() {
    appShell.classList.toggle("is-sidebar-collapsed", sidebarCollapsed);
    sidebar.setAttribute("data-collapsed", String(sidebarCollapsed));
}

function centerAddTaskButton(visibleTasksLength) {
    taskRegion.classList.toggle("is-empty", visibleTasksLength === 0);
}

/* ─── Task Element Builder ────────────────────────────────────────────────── */
function createTaskElement(task) {
    const priority = VALID_PRIORITIES.includes(task.priority) ? task.priority : "medium";
    const listItem = document.createElement("li");
    listItem.className = `task-card priority-${priority}${task.completed ? " is-completed" : ""}`;
    listItem.setAttribute("data-task-id", task.id);

    const mainRow = document.createElement("div");
    mainRow.className = "task-main";

    const titleRow = document.createElement("div");
    titleRow.className = "task-title-row";

    // Custom checkbox wrapper
    const checkboxWrap = document.createElement("div");
    checkboxWrap.className = "task-checkbox-wrap";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Mark "${task.title}" as complete`);
    checkbox.addEventListener("change", () => {
        toggleComplete(task.id);
    });

    const checkboxVisual = document.createElement("span");
    checkboxVisual.className = "task-checkbox-visual";
    checkboxVisual.setAttribute("aria-hidden", "true");

    checkboxWrap.append(checkbox, checkboxVisual);

    const titleWrap = document.createElement("div");
    titleWrap.className = "task-title-wrap";

    const title = document.createElement("h3");
    title.className = "task-title";
    title.textContent = task.title;

    const createdLabel = document.createElement("span");
    createdLabel.className = "task-created";
    createdLabel.textContent = `Added ${new Date(task.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

    titleWrap.append(title, createdLabel);
    titleRow.append(checkboxWrap, titleWrap);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button-secondary task-action-button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => populateEditForm(task.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button-secondary task-action-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    actions.append(editButton, deleteButton);
    mainRow.append(titleRow, actions);

    const meta = document.createElement("div");
    meta.className = "task-meta";

    const dateLabel = getTaskDateLabel(task);

    if (dateLabel) {
        const dateMeta = document.createElement("span");
        dateMeta.className = "task-meta-item task-date-range";
        dateMeta.textContent = dateLabel;
        meta.append(dateMeta);
    }

    if (isTaskOverdue(task)) {
        const overdueBadge = document.createElement("span");
        overdueBadge.className = "task-meta-item overdue-badge";
        overdueBadge.textContent = "Overdue";
        meta.append(overdueBadge);
    }

    const priorityLabels = { low: "Low", medium: "Medium", high: "High" };
    const priorityBadge = document.createElement("span");
    priorityBadge.className = `priority-badge ${priority}`;
    priorityBadge.textContent = `${priorityLabels[priority] || "Medium"} Priority`;
    meta.append(priorityBadge);

    const status = document.createElement("span");
    status.className = "task-meta-item";
    status.textContent = task.completed ? "Completed" : "Active";
    meta.append(status);

    listItem.append(mainRow, meta);

    return listItem;
}

/* ─── Render ──────────────────────────────────────────────────────────────── */
function renderTasks() {
    const visibleTasks = getVisibleTasks();

    taskList.innerHTML = "";

    navButtons.forEach((button) => {
        const isActive = button.dataset.view === currentNavView;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });

    filterButtons.forEach((button) => {
        const isActive = button.dataset.filter === currentFilter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });

    pageTitle.textContent = getCurrentPageTitle();
    todayLabel.textContent = getTodayLabel();
    updateNavigationCounts();
    clearCompletedButton.disabled = !tasks.some((task) => task.completed);
    centerAddTaskButton(visibleTasks.length);

    if (visibleTasks.length === 0) {
        emptyState.hidden = false;
        const emptyText = emptyState.querySelector(".empty-state-text");
        const emptySub = emptyState.querySelector(".empty-state-sub");

        if (tasks.length === 0) {
            emptyText.textContent = "No tasks yet.";
            emptySub.textContent = "Add one below to get started.";
        } else {
            emptyText.textContent = "No matching tasks.";
            emptySub.textContent = "Try a different filter or search term.";
        }

        return;
    }

    emptyState.hidden = true;

    const fragment = document.createDocumentFragment();

    visibleTasks.forEach((task) => {
        fragment.appendChild(createTaskElement(task));
    });

    taskList.appendChild(fragment);
}

/* ─── Form Submit ─────────────────────────────────────────────────────────── */
async function handleTaskFormSubmit(event) {
    event.preventDefault();

    if (!validateTitle()) {
        currentModalStep = 1;
        updateModalStep();
        return;
    }

    if (!validateDateRange()) {
        currentModalStep = 2;
        updateModalStep();
        return;
    }

    const title = titleInput.value.trim();
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const priority = getSelectedPriority();

    submitButton.disabled = true;

    const wasSaved = editingTaskId
        ? await editTask(editingTaskId, { title, startDate, endDate, priority })
        : await addTask(title, startDate, endDate, priority);

    submitButton.disabled = false;

    if (!wasSaved) return;

    closeTaskModal();
}

/* ─── Keyboard ────────────────────────────────────────────────────────────── */
function handleModalKeyboard(event) {
    if (event.key === "Escape") {
        if (!confirmDialog.hidden) {
            closeConfirmDialog();
            return;
        }

        if (!taskModal.hidden) {
            closeTaskModal();
        }
    }

    // Ctrl+K / Cmd+K → focus search
    if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
}

/* ─── Event Wiring ────────────────────────────────────────────────────────── */
function registerEventListeners() {
    taskForm.addEventListener("submit", handleTaskFormSubmit);

    taskForm.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const isDateField = event.target === startDateInput || event.target === endDateInput;

            if (isDateField) return;

            event.preventDefault();

            if (currentModalStep < 3) {
                nextModalStep();
            } else {
                taskForm.requestSubmit();
            }
        }
    });

    openModalButton.addEventListener("click", () => {
        resetForm();
        openTaskModal();
    });

    closeModalButton.addEventListener("click", closeTaskModal);
    nextButton.addEventListener("click", nextModalStep);
    backButton.addEventListener("click", previousModalStep);

    titleInput.addEventListener("input", () => {
        updateCharCount();
        const titleLength = titleInput.value.trim().length;
        if (titleLength > 0 && titleLength <= MAX_TITLE_LENGTH) clearTitleError();
    });

    [startDateInput, endDateInput].forEach((dateInput) => {
        dateInput.addEventListener("click", () => openDatePicker(dateInput));
        dateInput.addEventListener("focus", () => openDatePicker(dateInput));
        dateInput.addEventListener("keydown", blockDateTyping);
        dateInput.addEventListener("paste", (event) => event.preventDefault());
        dateInput.addEventListener("change", () => {
            syncDateBounds();
            validateDateRange();
        });
    });

    priorityRadios.forEach((radio) => {
        radio.addEventListener("change", updatePriorityCards);
    });

    searchInput.addEventListener("input", () => {
        searchTasks(searchInput.value);
    });

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => filterTasks(button.dataset.filter));
    });

    clearCompletedButton.addEventListener("click", clearCompletedTasks);

    navButtons.forEach((button) => {
        button.addEventListener("click", () => setNavView(button.dataset.view));
    });

    menuButton.addEventListener("click", toggleSidebar);
    themeToggleButton.addEventListener("click", toggleTheme);

    taskModal.addEventListener("click", (event) => {
        if (event.target === taskModal) closeTaskModal();
    });

    confirmDialog.addEventListener("click", (event) => {
        if (event.target === confirmDialog) closeConfirmDialog();
    });

    confirmDeleteBtn.addEventListener("click", () => {
        const id = pendingDeleteId;
        closeConfirmDialog();
        if (id) commitDelete(id);
    });

    confirmCancelBtn.addEventListener("click", closeConfirmDialog);

    document.addEventListener("keydown", handleModalKeyboard);

    window.addEventListener("resize", () => {
        if (window.innerWidth <= 900 && !sidebarCollapsed) {
            sidebarCollapsed = true;
            applySidebarState();
        }
    });
}

/* ─── Init ────────────────────────────────────────────────────────────────── */
async function initializeApp() {
    loadTheme();
    registerEventListeners();
    updateGlassTheme();
    applySidebarState();
    setSelectedPriority("medium");
    pageTitle.textContent = getCurrentPageTitle();
    todayLabel.textContent = getTodayLabel();
    updateModalStep();
    closeTaskModal();
    confirmDialog.hidden = true;
    updateCharCount();
    await loadTasks();
    renderTasks();
}

initializeApp();

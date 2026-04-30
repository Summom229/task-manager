"use strict";

require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const VALID_PRIORITIES = ["low", "medium", "high"];
const MAX_TITLE_LENGTH = 80;

let tasks = [];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function createId() {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeTaskInput(body, existingTask = {}) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startDate = typeof body.startDate === "string" ? body.startDate : "";
    const endDate = typeof body.endDate === "string" ? body.endDate : "";
    const priority = VALID_PRIORITIES.includes(body.priority) ? body.priority : "medium";

    return {
        ...existingTask,
        title,
        completed: typeof body.completed === "boolean" ? body.completed : Boolean(existingTask.completed),
        startDate,
        endDate,
        dueDate: endDate,
        priority
    };
}

function validateTask(task) {
    if (!task.title) {
        return "Task title is required.";
    }

    if (task.title.length > MAX_TITLE_LENGTH) {
        return `Task title must be ${MAX_TITLE_LENGTH} characters or less.`;
    }

    if (task.startDate && task.endDate && task.endDate < task.startDate) {
        return "End date cannot be earlier than start date.";
    }

    return null;
}

function findTaskIndex(id) {
    return tasks.findIndex((task) => task.id === id);
}

app.get("/api/tasks", (req, res) => {
    res.status(200).json(tasks);
});

app.post("/api/tasks", (req, res) => {
    try {
        const taskData = normalizeTaskInput(req.body);
        const validationError = validateTask(taskData);

        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const now = new Date().toISOString();
        const task = {
            id: createId(),
            ...taskData,
            createdAt: now,
            updatedAt: null
        };

        tasks.unshift(task);
        return res.status(201).json(task);
    } catch (error) {
        console.error("Failed to create task.", error);
        return res.status(500).json({ error: "Failed to create task." });
    }
});

app.put("/api/tasks/:id", (req, res) => {
    try {
        const taskIndex = findTaskIndex(req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: "Task not found." });
        }

        const taskData = normalizeTaskInput(req.body, tasks[taskIndex]);
        const validationError = validateTask(taskData);

        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const updatedTask = {
            ...tasks[taskIndex],
            ...taskData,
            updatedAt: new Date().toISOString()
        };

        tasks[taskIndex] = updatedTask;
        return res.status(200).json(updatedTask);
    } catch (error) {
        console.error("Failed to update task.", error);
        return res.status(500).json({ error: "Failed to update task." });
    }
});

app.delete("/api/tasks/:id", (req, res) => {
    try {
        const taskIndex = findTaskIndex(req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: "Task not found." });
        }

        tasks.splice(taskIndex, 1);
        return res.status(200).json({ message: "Task deleted." });
    } catch (error) {
        console.error("Failed to delete task.", error);
        return res.status(500).json({ error: "Failed to delete task." });
    }
});

app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Task Manager running at http://localhost:${PORT}`);
});

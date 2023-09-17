const bcrypt = require("bcrypt");
const express = require("express");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const app = express();
const cors = require("cors");
app.use(express.json());
app.use(cors());

let db = null;
const dbPath = path.join(__dirname, "taskManagement.db");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(process.env.PORT || 3000, () => {
      console.log("Server running on http://localhost:3000/");
    });
  } catch (e) {
    response.send(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send({ returnResponse: "Invalid JWT Token" });
  } else {
    jwt.verify(jwtToken, "taskManagement", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send({ returnResponse: "Invalid JWT Token" });
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const getUserId = async (request, response, next) => {
  const username = request.username;

  const getUserIdQuery = `SELECT * FROM users WHERE username='${username}';`;

  const userIdObj = await db.get(getUserIdQuery);
  const userId = userIdObj.id;
  request.loginUserId = userId;
  next();
};

//API 1: Register a user
app.post("/signup/", async (request, response) => {
  const givenDetails = request.body;

  const {
    name,
    username,
    password,
    gender,
    description,
    is_admin,
  } = givenDetails;

  const selectUserQuery = `SELECT * FROM users WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const getUsersCountQuery = "SELECT count(*) as users_count FROM users;";
    const userCountResponse = await db.get(getUsersCountQuery);
    const newId = userCountResponse.users_count + 1;

    if (password.length < 6) {
      response.status(400);
      response.send({ returnResponse: "Password is too short" });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const registerUserQuery = `
            INSERT INTO users (id, name, username, password, gender, description, is_admin)
            VALUES(
                ${newId},
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}',
                '${description}',
                0
            );`;

      await db.run(registerUserQuery);
      response.status(200);
      response.send({ returnResponse: "User created successfully" });
    }
  } else {
    response.status(400);
    response.send({ returnResponse: "User already exists" });
  }
});

//API 2: Login in the user
app.post("/login/", async (request, response) => {
  const givenDetails = request.body;

  const { username, password } = givenDetails;

  const selectUserQuery = `SELECT * FROM users WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatch) {
      let jwtToken;

      const selectUserQuery = `SELECT * FROM users WHERE username = '${username}';`;
      const loggedInUserDetails = await db.get(selectUserQuery);

      const payload = { username: username };
      jwtToken = jwt.sign(payload, "taskManagement");
      response.send({ jwtToken, loggedInUserDetails });
    } else {
      response.status(400);
      response.send({ returnResponse: "Invalid password" });
    }
  } else {
    response.status(400);
    response.send({ returnResponse: "Invalid user" });
  }
});

//API 3: GET Tasks List

app.get(
  "/tasks/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;

    const getTasksList = `SELECT * FROM tasks;`;

    const dbResponse = await db.all(getTasksList);
    response.send({ returnResponse: dbResponse });
  }
);

//API 4: Add new Task

app.post(
  "/addTask/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;

    const getTasksCountQuery = "SELECT count(*) as task_count FROM tasks;";
    const tasksCountResponse = await db.get(getTasksCountQuery);
    const newTaskId = tasksCountResponse.task_count + 1;

    const {
      title,
      description,
      assigned_date,
      assigned_by,
      assigned_to,
      task_status,
    } = request.body;

    const insertTaskQuery = `INSERT INTO tasks (id, title, description, assigned_date, assigned_by, assigned_to, task_status)
                VALUES(
                    ${newTaskId},
                    '${title}',
                    '${description}',
                    '${assigned_date}',
                    '${assigned_by}',
                    '${assigned_to}',
                    '${task_status}'
                )`;

    await db.run(insertTaskQuery);
    response.status(200);
    response.send({ returnResponse: "Task Added Successfully" });
  }
);

//API 5: Update User Details
app.put(
  "/profiles/:userId/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { userId } = request.params;

    const { updatedName, updatedGender, updatedDescription } = request.body;

    let { updatedIs_admin } = request.body;

    const profileDetailsQuery = `SELECT * FROM users WHERE id = ${userId};`;
    const dbResponse = await db.all(profileDetailsQuery);
    const currentAdminStatus = dbResponse[0].is_admin;

    updatedIs_admin =
      updatedIs_admin === undefined ? currentAdminStatus : updatedIs_admin;

    const updateProfileQuery = `UPDATE users SET 
    name = '${updatedName}',
    gender = '${updatedGender}',
    description = '${updatedDescription}',
    is_admin = '${updatedIs_admin}' 
    WHERE id=${userId};`;

    await db.run(updateProfileQuery);
    response.status(200);
    response.send({ returnResponse: "Profile Updated Successfully" });
  }
);

//API 6: Update Task Status

app.put(
  "/updateTaskStatus/:taskId",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { taskId } = request.params;

    const { update_task_status } = request.body;

    const updateTaskStatusQuery = `UPDATE tasks SET task_status = '${update_task_status}' WHERE id = ${taskId};`;

    await db.run(updateTaskStatusQuery);
    response.status(200);
    response.send({ returnResponse: "Status Updated Successfully" });
  }
);

//API 7: Update Task details by Admin

app.put(
  "/updateTaskDetails/:taskId",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { taskId } = request.params;

    const {
      title,
      description,
      assigned_date,
      assigned_by,
      assigned_to,
      task_status,
    } = request.body;

    const modifyTaskDetailsQuery = `UPDATE tasks 
    SET 
    title = '${title}',
    description = '${description}',
    assigned_date = '${assigned_date}',
    assigned_by = '${assigned_by}',
    assigned_to = '${assigned_to}',
    task_status = '${task_status}' WHERE id = ${taskId};`;

    await db.run(modifyTaskDetailsQuery);
    response.status(200);
    response.send({ returnResponse: "Task Details Updated Successfully" });
  }
);

//API 8: GET users list
app.get(
  "/profiles/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;

    const getUsersListQuery = `SELECT * FROM users;`;

    const dbResponse = await db.all(getUsersListQuery);
    response.send({ returnResponse: dbResponse });
  }
);

//API 9: delete task

app.delete(
  "/tasks/:taskId",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { taskId } = request.params;

    const deleteTaskQuery = `DELETE FROM tasks WHERE id = ${taskId};`;

    await db.run(deleteTaskQuery);
    response.status(200);
    response.send({ returnResponse: "Task Deleted Successfully" });
  }
);

//API 10: delete user

app.delete(
  "/profiles/:userId",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { userId } = request.params;

    const deleteUserQuery = `DELETE FROM users WHERE id = ${userId};`;

    await db.run(deleteUserQuery);
    response.status(200);
    response.send({ returnResponse: "User Deleted Successfully" });
  }
);

//API 11: GET comments of post
app.get(
  "/tasks/:taskId",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { taskId } = request.params;

    const getCommentsQuery = `SELECT comments.comment, users.name AS commented_by 
    FROM comments JOIN users ON comments.commented_by_id = users.id WHERE comments.task_id = ${taskId};`;

    const dbResponse = await db.all(getCommentsQuery);
    response.send({ returnResponse: dbResponse });
  }
);

//API 12: Add comment
app.post(
  "/tasks/:taskId/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const loginUserId = request.loginUserId;
    const { taskId } = request.params;

    const { comment } = request.body;

    const postCommentQuery = `INSERT INTO comments (comment, task_id, commented_by_id)
    VALUES ('${comment}', ${taskId}, ${loginUserId});`;

    await db.run(postCommentQuery);
    response.status(200);
    response.send({ returnResponse: "Comment Added Successfully" });
  }
);

//API 13: GET tasks of a Particular username
app.get(
  "/myTasks/:username/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const { username } = request.params;
    const loginUserId = request.loginUserId;

    const getMyTasksQuery = `SELECT task_status, count(*) AS no_of_tasks FROM tasks WHERE assigned_to = '${username}' GROUP BY task_status;`;

    const dbResponse = await db.all(getMyTasksQuery);

    const statusResponse = {
      assigned: 5,
      done: 10,
      in_progress: 20,
    };

    for (let each of dbResponse) {
      statusResponse[each.task_status] = each.no_of_tasks;
    }
    response.send({ returnResponse: statusResponse });
  }
);

module.exports = app;

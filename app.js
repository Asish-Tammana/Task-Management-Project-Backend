const bcrypt = require("bcrypt");
const express = require("express");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const app = express();
app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
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
    response.send("Invalid JWT Token");
    console.log("1");
  } else {
    jwt.verify(jwtToken, "ca2", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
        console.log("2");
      } else {
        request.username = payload.username;
        next();
        console.log("3");
      }
    });
  }
};

const getUserId = async (request, response, next) => {
  const username = request.username;

  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;

  const userIdObj = await db.get(getUserIdQuery);
  const userId = userIdObj.user_id;
  request.userId = userId;
  next();
};

//API 1: Register a user
app.post("/register/", async (request, response) => {
  const givenDetails = request.body;

  const { username, password, name, is_admin } = givenDetails;

  const selectUserQuery = `SELECT * FROM users WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const registerUserQuery = `
            INSERT INTO users(name, username, password, is_admin)
            VALUES(
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${is_admin}'
            );`;

      await db.run(registerUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2: Login in the user
app.post("/login/", async (request, response) => {
  const givenDetails = request.body;

  const { username, password } = givenDetails;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatch) {
      let jwtToken;
      const payload = { username: username };
      jwtToken = jwt.sign(payload, "ca2");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 3: GET four latest tweets
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const userId = request.userId;
    console.log(userId);

    const getLatestTweetsQuery = `
    SELECT 
    user.username AS username,
    tweet.tweet AS tweet,
    tweet.date_time AS dateTime
     FROM (follower INNER JOIN tweet 
    ON follower.following_user_id = tweet.user_id) AS t INNER JOIN 
    user ON t.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${userId}
    ORDER BY tweet.date_time DESC
    LIMIT 4
    ;`;

    const dbResponse = await db.all(getLatestTweetsQuery);
    response.send(dbResponse);
  }
);

//API 4: GET the names followed by user
app.get(
  "/user/following/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const userId = request.userId;
    const getUsersQuery = `
    SELECT 
    user.name AS name
     FROM follower INNER JOIN 
    user ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${userId};
    `;

    const dbResponse = await db.all(getUsersQuery);
    response.send(dbResponse);
  }
);

//API 5: GET the user followers
app.get(
  "/user/followers/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const userId = request.userId;

    const getFollowingUserNamesQuery = `
    SELECT 
    user.name AS name
     FROM follower INNER JOIN 
    user ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${userId}; 
    `;

    const dbResponse = await db.all(getFollowingUserNamesQuery);
    response.send(dbResponse);
  }
);

//API 6: GET the tweet details
app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;

    const getPersonIdQuery = `SELECT user_id FROM tweet
   WHERE tweet_id = ${tweetId};`;

    const tweetPersonResponse = await db.get(getPersonIdQuery);
    const tweetedId = tweetPersonResponse.user_id;

    const isFollowingQuery = `SELECT * FROM 
  tweet INNER JOIN follower
  ON tweet.user_id = follower.following_user_id
  WHERE follower_user_id = ${userId} AND 
  following_user_id = ${tweetedId} ;`;

    const followingResponse = await db.all(isFollowingQuery);
    //console.log(followingResponse);

    if (followingResponse.length !== 0) {
      const getLikesCountQuery = `SELECT
    count(*) as likes
    FROM like
    WHERE tweet_id = ${tweetId};
    `;

      const likesCount = await db.get(getLikesCountQuery);
      //console.log(likesCount);

      const getRepliesCountQuery = `SELECT
    count(*) as replies 
    FROM reply
    WHERE tweet_id = ${tweetId};
    `;

      const repliesCount = await db.get(getRepliesCountQuery);
      //console.log(repliesCount);

      const getTweetQuery = `
    SELECT tweet, date_time as dateTime
    FROM tweet 
    WHERE tweet_id = ${tweetId};
    `;

      const tweetDetails = await db.get(getTweetQuery);
      //console.log(tweetDetails);

      const outputResponse = {
        tweet: tweetDetails.tweet,
        likes: likesCount.likes,
        replies: repliesCount.replies,
        dateTime: tweetDetails.dateTime,
      };
      response.send(outputResponse);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 7: GET usernames who likes the tweet
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;

    const getPersonIdQuery = `SELECT user_id FROM tweet
   WHERE tweet_id = ${tweetId};`;

    const tweetPersonResponse = await db.get(getPersonIdQuery);
    const tweetedId = tweetPersonResponse.user_id;
    //console.log(tweetedId);

    const isFollowingQuery = `SELECT * FROM 
  tweet INNER JOIN follower
  ON tweet.user_id = follower.following_user_id
  WHERE follower_user_id = ${userId} AND 
  following_user_id = ${tweetedId} ;`;

    const followingResponse = await db.all(isFollowingQuery);
    //console.log(followingResponse);

    if (followingResponse.length !== 0) {
      const getUserLikeNamesQuery = `
    SELECT 
   *
     FROM like INNER JOIN user ON 
    like.user_id = user.user_id
    WHERE like.tweet_id = ${tweetId};
    `;

      const dbResponse = await db.all(getUserLikeNamesQuery);

      const likesList = [];

      for (let each of dbResponse) {
        likesList.push(each.username);
      }

      let outputResponse = {
        likes: likesList,
      };

      response.send(outputResponse);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8: GET replies of tweet
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;

    const getPersonIdQuery = `SELECT user_id FROM tweet
   WHERE tweet_id = ${tweetId};`;

    const tweetPersonResponse = await db.get(getPersonIdQuery);
    const tweetedId = tweetPersonResponse.user_id;

    const isFollowingQuery = `SELECT * FROM 
  tweet INNER JOIN follower
  ON tweet.user_id = follower.following_user_id
  WHERE follower_user_id = ${userId} AND 
  following_user_id = ${tweetedId} ;`;

    const followingResponse = await db.all(isFollowingQuery);

    if (followingResponse.length !== 0) {
      const getRepliesQuery = `SELECT 
        user.name,
        reply.reply
     FROM reply INNER JOIN user
    ON reply.user_id = user.user_id
    WHERE reply.tweet_id = ${tweetId};`;

      const dbResponse = await db.all(getRepliesQuery);
      const outputResponse = {
        replies: dbResponse,
      };

      response.send(outputResponse);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9: GET all tweets of the user
app.get(
  "/user/tweets/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const userId = request.userId;

    const getTweetDetailsQuery = `SELECT  tweet_id ,tweet,date_time AS dateTime FROM tweet
    WHERE user_id=${userId};`;

    const tweetsResponse = await db.all(getTweetDetailsQuery);

    const getLikesQuery = `SELECT count(*) AS likes FROM like INNER JOIN tweet ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id=${userId}
    GROUP BY tweet.tweet_id`;
    const likesResponse = await db.all(getLikesQuery);

    const getRepliesQuery = `SELECT count(*) AS replies FROM reply INNER JOIN tweet ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id=${userId}
    GROUP BY tweet.tweet_id`;

    const repliesResponse = await db.all(getRepliesQuery);

    const finalResponse = [];

    for (let i = 0; i < tweetsResponse.length; i++) {
      const tweetDetail = {
        tweet: tweetsResponse[i].tweet,
        likes: likesResponse[i].likes,
        replies: repliesResponse[i].replies,
        dateTime: tweetsResponse[i].dateTime,
      };

      finalResponse.push(tweetDetail);
    }

    response.send(finalResponse);
  }
);

//API 10: CREATE tweet in the tweet table
app.post(
  "/user/tweets/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const Tweet = request.body;
    const { tweet } = Tweet;
    const userId = request.userId;

    const createTweetQuery = `
    INSERT INTO tweet(tweet,user_id)
    VALUES('${tweet}',${userId});`;

    await db.run(createTweetQuery);
    response.send("Created a Tweet");
  }
);

//API 11: DELETE tweet
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;

    const getTweetQuery = `SELECT * FROM tweet 
    WHERE tweet_id = ${tweetId} AND user_id = ${userId};`;

    const tweetResponse = await db.get(getTweetQuery);

    if (tweetResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId};
      `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;

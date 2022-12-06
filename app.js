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
  let jwToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwToken = authHeader.split(" ")[1];
  }

  if (jwToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
    console.log("1");
  } else {
    jwt.verify(jwToken, "ca2", async (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
        response.status(401);
        console.log("2");
      } else {
        next();
        console.log("3");
      }
    });
  }
};

//API 1: Register a user
app.post("/register/", async (request, response) => {
  const givenDetails = request.body;

  const { username, password, name, gender } = givenDetails;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const registerUserQuery = `
            INSERT INTO user(name, username, password, gender)
            VALUES(
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
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
      let jwToken;
      const payload = { username: username };
      jwToken = jwt.sign(payload, "ca2");
      response.send({ jwToken });
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
  async (request, response) => {
    const userId = 2;

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
app.get("/user/following/", authenticationToken, async (request, response) => {
  const userId = 1;
  const getUsersQuery = `
    SELECT 
    user.username AS username
     FROM follower INNER JOIN 
    user ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${userId}
    `;

  const dbResponse = await db.all(getUsersQuery);
  response.send(dbResponse);
});

//API 5: GET the user followers
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const userId = 1;

  const getFollowingUserNamesQuery = `
    SELECT 
    user.username AS username
     FROM follower INNER JOIN 
    user ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${userId} 
    `;

  const dbResponse = await db.all(getFollowingUserNamesQuery);
  response.send(dbResponse);
});

//API 6: GET the tweet details
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const userId = 1;

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
    console.log(likesCount);

    const getRepliesCountQuery = `SELECT
    count(*) as replies 
    FROM reply
    WHERE tweet_id = ${tweetId};
    `;

    const repliesCount = await db.get(getRepliesCountQuery);
    console.log(repliesCount);

    const getTweetQuery = `
    SELECT tweet, date_time as dateTime
    FROM tweet 
    WHERE tweet_id = ${tweetId};
    `;

    const tweetDetails = await db.get(getTweetQuery);
    console.log(tweetDetails);

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
});

//API 7: GET usernames who likes the tweet
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = 1;

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
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = 1;

    const getPersonIdQuery = `SELECT user_id FROM tweet
   WHERE tweet_id = ${tweetId};`;

    const tweetPersonResponse = await db.get(getPersonIdQuery);
    const tweetedId = tweetPersonResponse.user_id;
    console.log(tweetedId);

    const isFollowingQuery = `SELECT * FROM 
  tweet INNER JOIN follower
  ON tweet.user_id = follower.following_user_id
  WHERE follower_user_id = ${userId} AND 
  following_user_id = ${tweetedId} ;`;

    const followingResponse = await db.all(isFollowingQuery);
    console.log(followingResponse);

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
app.get("/user/tweets/", async (request, response) => {
  const userId = 1;

  const getTweetDetailsQuery = `SELECT 
  tweet.tweet_id,
  tweet.tweet,
  count(like.like_id) as likes
   FROM tweet INNER JOIN like 
ON tweet.tweet_id = like.tweet_id
WHERE tweet.user_id = ${userId}
GROUP BY like.tweet_id;`;

  const dbResponse = await db.all(getTweetDetailsQuery);
  response.send(dbResponse);
});

//API 10: CREATE tweet in the tweet table
app.get("/user/tweets/", async (request, response) => {
  const givenTweet = request.body;

  const createTweetQuery = `
    INSERT INTO tweet(tweet)
    VALUES(
        '${givenTweet}'
    );
    `;

  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11: DELETE tweet
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = 1;

    const getTweetQuery = `SELECT * FROM tweet 
    WHERE tweet_id = ${tweetId} AND user_id = ${userId};`;

    const tweetResponse = await db.get(getTweetQuery);
    console.log(tweetResponse);

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

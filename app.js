const express = require("express");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db;

const intializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};

intializeDbAndServer();

//Register User API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `
  SELECT * FROM user
  WHERE username LIKE '${username}';`;

  const user = await db.get(getUserQuery);
  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const postUserQuery = `
          INSERT INTO user
          (name, username, password, gender)
          VALUES
          (
              '${name}',
              '${username}',
              '${hashedPassword}',
              '${gender}'
          );`;

      await db.run(postUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login User API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
  SELECT * FROM user
  WHERE username LIKE '${username}';`;

  const user = await db.get(getUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "My_Secret_Key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with JWT Token
const authenticate = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secret_Key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Get Tweets API
app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  let { user_id } = await db.get(getUserIdQuery);

  const getFollowingUsersIdQuery = `
  SELECT following_user_id FROM follower
  WHERE follower_user_id = ${user_id};`;

  const followingUsers = await db.all(getFollowingUsersIdQuery);
  let followingUserIdArr = [];
  for (let object of followingUsers) {
    followingUserIdArr.push(object.following_user_id);
  }
  let ids = `(${followingUserIdArr.join(",")})`;
  const getTweetsQuery = `
  SELECT
  user.username AS username,
  tweet.tweet AS tweet,
  tweet.date_time AS dateTime 
  FROM tweet
  INNER JOIN user 
  ON tweet.user_id = user.user_id
  WHERE tweet.user_id IN ${ids}
  ORDER BY strftime('%H %M %S',tweet.date_time),
  strftime('%Y %m %d',tweet.date_time)
  LIMIT 4;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//Get Following API
app.get("/user/following/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  let { user_id } = await db.get(getUserIdQuery);

  const getUserFollowingQuery = `
  SELECT user.name
  FROM user
  INNER JOIN follower
  ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${user_id};`;

  const followingList = await db.all(getUserFollowingQuery);
  response.send(followingList);
});

//Get Followers API
app.get("/user/followers/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  let { user_id } = await db.get(getUserIdQuery);

  const getUserFollowersQuery = `
  SELECT user.name
  FROM user
  INNER JOIN follower
  ON user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = ${user_id};`;

  const followersList = await db.all(getUserFollowersQuery);
  response.send(followersList);
});

app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserIdQuery);

  const { tweetId } = request.params;
  const getTweetUserIdQuery = `
    SELECT user_id FROM
    tweet WHERE tweet_id = ${tweetId};`;
  let userId = await db.get(getTweetUserIdQuery);
  const tweetUserId = userId.user_id;

  const checkFollowingQuery = `
  SELECT *
  FROM follower
  WHERE follower_user_id = ${user_id}
  AND following_user_id = ${tweetUserId};`;

  let followingUser = await db.get(checkFollowingQuery);
  if (followingUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetQuery = `
      SELECT 
      tweet.tweet AS tweet,
      COUNT(like.like_id) AS likes,
      COUNT(reply.reply) AS replies,
      tweet.date_time AS dateTime
      FROM tweet
      INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
      INNER JOIN like ON like.tweet_id = tweet.tweet_id
      WHERE tweet.tweet_id  = ${tweetId}
      GROUP BY reply.tweet_id, like.tweet_id;`;

    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
});

app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserIdQuery);

  const { tweetId } = request.params;
  const getTweetUserIdQuery = `
    SELECT user_id FROM
    tweet WHERE tweet_id = ${tweetId};`;
  let userId = await db.get(getTweetUserIdQuery);
  const tweetUserId = userId.user_id;

  const checkFollowingQuery = `
  SELECT *
  FROM follower
  WHERE follower_user_id = ${user_id}
  AND following_user_id = ${tweetUserId};`;

  let followingUser = await db.get(checkFollowingQuery);
  if (followingUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getLikedUsersQuery = `
      SELECT user.username
      FROM like
      INNER JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id = ${tweetId};`;

    const usersList = await db.all(getLikedUsersQuery);
    let likedUsersList = [];
    for (let user of usersList) {
      likedUsersList.push(user.username);
    }
    response.send({ likes: likedUsersList });
  }
});

app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id FROM user
        WHERE username = '${username}';`;
    const { user_id } = await db.get(getUserIdQuery);

    const { tweetId } = request.params;
    const getTweetUserIdQuery = `
        SELECT user_id FROM
        tweet WHERE tweet_id = ${tweetId};`;
    let userId = await db.get(getTweetUserIdQuery);
    const tweetUserId = userId.user_id;

    const checkFollowingQuery = `
        SELECT *
        FROM follower
        WHERE follower_user_id = ${user_id}
        AND following_user_id = ${tweetUserId};`;

    let followingUser = await db.get(checkFollowingQuery);
    if (followingUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliedUsersQuery = `
        SELECT user.name,
        reply.reply
        FROM reply
        INNER JOIN user ON reply.user_id = user.user_id
        WHERE reply.tweet_id = ${tweetId};`;

      const usersList = await db.all(getRepliedUsersQuery);
      response.send({ replies: usersList });
    }
  }
);

app.get("/user/tweets/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserIdQuery);

  const getTweetsQuery = `
  SELECT
  tweet.tweet AS tweet,
  COUNT(like.like_id) AS likes,
  tweet.date_time AS dateTime
  FROM tweet
  INNER JOIN like ON like.tweet_id = tweet.tweet_id
  WHERE tweet.user_id = ${user_id}
  GROUP BY tweet.tweet_id`;

  const tweetsList = await db.all(getTweetsQuery);
  response.send(tweetsList);
});

//Post Tweet API
app.post("/user/tweets/", authenticate, async (request, response) => {
  const { tweet } = request.body;
  const postTweetQuery = `
    INSERT INTO tweet
    (tweet)
    VALUES
    ('${tweet}')`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet API
app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserIdQuery);

  const { tweetId } = request.params;
  const getTweetUserIdQuery = `
    SELECT user_id FROM
    tweet WHERE tweet_id = ${tweetId}
    AND user_id = ${user_id};`;
  const userId = await db.get(getTweetUserIdQuery);
  if (userId === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
      DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;

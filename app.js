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
      response.send("Invalid Password");
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
  console.log(ids);
  const getTweetsQuery = `
  SELECT * FROM tweet
  WHERE user_id IN ${ids}
  LIMIT 4;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

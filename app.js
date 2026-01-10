if(process.env.NODE_ENV !== "production") {
require('dotenv').config();
}

const express = require('express');
const app = express();
const mongoose = require('mongoose');
const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const ExpressError = require("./utils/ExpressError.js");
const listingsRouter = require("./routes/listing.js");
const reviewsRouter = require("./routes/reviews.js");
const userRouter = require("./routes/user.js");
const sessions = require('express-session');
const MongoStore= require('connect-mongo');
const flash = require('connect-flash');
const passport = require('passport');
const User = require('./models/user.js');
const LocalPassport = require('passport-local');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const oauthRoutes = require('./routes/OAuth.js');


app.use(methodOverride('_method'));
app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.engine('ejs', ejsMate);
app.use(express.static(path.join(__dirname, "/public")));


// MongoDB connection URL
// const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const dbUrl=process.env.ATLAS_URL;

main()
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(dbUrl);
}

const store= MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600, // time in seconds after which session will be updated
});

store.on("error", function(e) {
  console.log("Session store error", e);
});

// Session configuration
const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

app.use(sessions(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalPassport(User.authenticate()));

// --- Google Strategy ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);
      // If email exists, link accounts by email (optional)
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      if (email) {
        user = await User.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          await user.save();
          return done(null, user);
        }
      }
      // else create new user
      const newUser = new User({
        username: profile.displayName || (email ? email.split('@')[0] : `google_${profile.id}`),
        email: email,
        googleId: profile.id
      });
      await newUser.save();
      return done(null, newUser);
    } catch (err) {
      done(err, null);
    }
  }
));



passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware to save redirect URL

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currentUser = req.user;
  res.locals.hideSearch = false; // default: search bar is visible
  next();
});

app.get("/", (req, res) => {
  res.redirect("/listings");
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.use("/listings", listingsRouter);
app.use("/listings/:id/reviews", reviewsRouter);
app.use("/", userRouter);
app.use(oauthRoutes);

app.use((req, res, next) => {
  next(new ExpressError("Page not found", 404));
});


// app.use((err, req, res, next) => {
//   let statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
//   let message = err.message || "Something went wrong!";
  
//   res.status(statusCode).render("users/error.ejs", { message });
// });
app.use((err, req, res, next) => {
  let statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  let message = err.message || "Something went wrong!";

  // log full error for debugging
  console.error("Error occurred:", {
    statusCode,
    message,
    stack: err.stack
  });

  res.status(statusCode).render("users/error.ejs", { message });
});


app.listen(8080, (req, res) => {
  console.log("Server is running on port 8080");
});  

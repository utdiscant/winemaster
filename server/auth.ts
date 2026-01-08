import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import type { User } from "@shared/schema";

// Session configuration
export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

// Helper: Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Helper: Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Helper: Check if first user (for auto-admin)
async function isFirstUser(): Promise<boolean> {
  const users = await storage.getAllUsers();
  return users.length === 0;
}

// Setup authentication
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Simplified serialization - just store user ID
  passport.serializeUser((user: Express.User, cb) => {
    cb(null, (user as User).id);
  });

  // Deserialize - fetch user from database
  passport.deserializeUser(async (id: string, cb) => {
    try {
      const user = await storage.getUser(id);
      cb(null, user || null);
    } catch (error) {
      cb(error, null);
    }
  });

  // ===== Local Strategy (Email/Password) =====
  passport.use(new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        // Find user by email
        const user = await storage.getUserByEmail(email);

        if (!user) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        // Check if user uses local auth
        if (user.authProvider !== 'local') {
          return done(null, false, { message: `Please sign in with ${user.authProvider}` });
        }

        // Verify password
        if (!user.passwordHash) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        // Ensure user has review cards
        await storage.ensureUserReviewCards(user.id);

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));

  // ===== Google OAuth Strategy =====
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = process.env.NODE_ENV === 'production'
      ? process.env.GOOGLE_CALLBACK_URL || `${process.env.APP_URL}/api/auth/google/callback`
      : 'http://localhost:5000/api/auth/google/callback';

    passport.use(new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error('No email from Google'), undefined);
          }

          // Check if user exists
          let user = await storage.getUserByEmail(email);

          if (user) {
            // Update existing user if needed
            if (user.authProvider !== 'google') {
              // User exists with different provider - update to Google
              user = await storage.upsertUser({
                id: user.id,
                email,
                firstName: profile.name?.givenName || user.firstName,
                lastName: profile.name?.familyName || user.lastName,
                profileImageUrl: profile.photos?.[0]?.value || user.profileImageUrl,
                authProvider: 'google',
                emailVerified: true,
                isAdmin: user.isAdmin,
              });
            }
          } else {
            // Create new user
            const isFirstUserFlag = await isFirstUser();

            user = await storage.upsertUser({
              email,
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
              profileImageUrl: profile.photos?.[0]?.value,
              authProvider: 'google',
              emailVerified: true,
              isAdmin: isFirstUserFlag, // First user becomes admin
            });
          }

          // Ensure user has review cards
          await storage.ensureUserReviewCards(user.id);

          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    ));
  }

  // ===== Auth Routes =====

  // Signup endpoint
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Check if first user
      const isFirstUserFlag = await isFirstUser();

      // Create user
      const user = await storage.upsertUser({
        email,
        passwordHash,
        firstName,
        lastName,
        authProvider: 'local',
        emailVerified: false, // Can implement email verification later
        isAdmin: isFirstUserFlag, // First user becomes admin
      });

      // Ensure user has review cards
      await storage.ensureUserReviewCards(user.id);

      // Log user in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to create session' });
        }
        res.json(user);
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // Login endpoint
  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', (err: any, user: User | false, info: any) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication error' });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || 'Invalid credentials' });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to create session' });
        }
        res.json(user);
      });
    })(req, res, next);
  });

  // Google OAuth initiate
  app.get('/api/auth/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
    })
  );

  // Google OAuth callback
  app.get('/api/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/',
      successRedirect: '/',
    })
  );

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // Keep existing dev endpoints if needed
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/dev/login-admin', async (req: any, res) => {
      try {
        const testAdminId = 'dev-admin-user';
        await storage.upsertUser({
          id: testAdminId,
          email: 'admin@winemaster.dev',
          firstName: 'Test',
          lastName: 'Admin',
          authProvider: 'local',
          emailVerified: true,
          isAdmin: true,
        });

        await storage.ensureUserReviewCards(testAdminId);

        const user = await storage.getUser(testAdminId);
        req.login(user, (err: any) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to create dev session' });
          }
          res.redirect('/');
        });
      } catch (error) {
        console.error('Dev admin login error:', error);
        res.status(500).json({ error: 'Failed to login as dev admin' });
      }
    });

    app.get('/api/dev/login-user', async (req: any, res) => {
      try {
        const testUserId = 'dev-regular-user';
        await storage.upsertUser({
          id: testUserId,
          email: 'user@winemaster.dev',
          firstName: 'Test',
          lastName: 'User',
          authProvider: 'local',
          emailVerified: true,
          isAdmin: false,
        });

        await storage.ensureUserReviewCards(testUserId);

        const user = await storage.getUser(testUserId);
        req.login(user, (err: any) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to create dev session' });
          }
          res.redirect('/');
        });
      } catch (error) {
        console.error('Dev user login error:', error);
        res.status(500).json({ error: 'Failed to login as dev user' });
      }
    });
  }
}

// Updated middleware - no token expiration check
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

// Middleware to check if user is admin
export const isAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as User;

  if (!req.isAuthenticated() || !user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const dbUser = await storage.getUser(user.id);
  if (!dbUser || !dbUser.isAdmin) {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  return next();
};

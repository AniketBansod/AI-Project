import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import passport from "passport";
import prisma from "./prisma";
import { PUBLIC_API_BASE } from "./config";

// Build a public base URL for OAuth callbacks (no trailing slash)
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || `${PUBLIC_API_BASE}/auth/google/callback`;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // --- UPDATED LOGIC ---

        // 1. First, try to find the user by their unique Google ID
        let user = await prisma.user.findFirst({
          where: { provider: "google", providerAccountId: profile.id },
        });

        // If the user is found with a Google ID, they are a returning Google user.
        if (user) {
          return done(null, user);
        }

        // 2. If no user with that Google ID, check if a user with the same email exists
        const userEmail = profile.emails?.[0]?.value;
        if (!userEmail) {
          return done(new Error("No email found from Google profile."), false);
        }

        const existingUserByEmail = await prisma.user.findUnique({
          where: { email: userEmail },
        });

        // 3. If a user with that email exists (from a previous email/password sign-up)
        if (existingUserByEmail) {
          // Link the Google account by updating the existing user record
          const updatedUser = await prisma.user.update({
            where: { email: userEmail },
            data: {
              provider: "google",
              providerAccountId: profile.id,
              // Optionally update name/image from Google profile
              name: profile.displayName, 
            },
          });
          return done(null, updatedUser);
        }

        // 4. If no user exists by Google ID or by email, create a new user
        const newUser = await prisma.user.create({
          data: {
            name: profile.displayName,
            email: userEmail,
            role: "STUDENT", // Default role
            provider: "google",
            providerAccountId: profile.id,
            emailVerified: new Date(), // Google emails are verified
          },
        });

        return done(null, newUser);
        
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

// src/utils/passport.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prisma";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: "http://localhost:5000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Find user by their Google ID
        let user = await prisma.user.findFirst({
          where: { provider: "google", providerAccountId: profile.id },
        });

        if (!user) {
          // If user doesn't exist, create a new one
          user = await prisma.user.create({
            data: {
              name: profile.displayName,
              email: profile.emails![0].value,
              role: "STUDENT", // Default role
              provider: "google",
              providerAccountId: profile.id,
              emailVerified: new Date(), // Google emails are verified
            },
          });
        }

        // Pass the user to the next step
        done(null, user);
      } catch (err) {
        done(err, false);
      }
    }
  )
);
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize() {
        // Edge runtime never authenticates.
        // Real authentication happens in auth.server.ts.
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
  },

  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;

      if (request.nextUrl.pathname.startsWith("/dashboard") && !isLoggedIn) {
        return false;
      }

      return true;
    },

    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }

      return token;
    },

    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }

      return session;
    },
  },
};

export default authConfig;

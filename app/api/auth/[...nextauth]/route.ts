import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // The Domain Lock: Only let official college emails through
      if (user.email && user.email.endsWith("@moderncoe.edu.in")) {
        return true;
      }
      // Rejects personal @gmail.com or other domains
      return false;
    },
  },
});

export { handler as GET, handler as POST };
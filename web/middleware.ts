import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Without Clerk keys the app runs in demo mode (alice/bob), so the middleware must be a no-op.
const enabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default enabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};

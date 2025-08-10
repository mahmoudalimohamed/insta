import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

export const toggleBookmark = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);
      const existing = await ctx.db
        .query("bookmarks")
        .withIndex("by_userId_and_postId", (q) =>
          q.eq("userId", currentUser._id).eq("postId", args.postId)
        )
        .first();

      if (existing) {
        await ctx.db.delete(existing._id);
        return false;
      } else {
        await ctx.db.insert("bookmarks", {
          userId: currentUser._id,
          postId: args.postId,
        });
        return true;
      }
    } catch (error) {
      console.error("Error in toggleBookmark:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const getBookmarkedPosts = query({
  handler: async (ctx) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);
      const bookmarks = await ctx.db
        .query("bookmarks")
        .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
        .collect();

      const bookmarksWithInfo = await Promise.all(
        bookmarks.map(async (bookmark) => {
          const post = await ctx.db.get(bookmark.postId);
          return post;
        })
      );
      return bookmarksWithInfo;
    } catch (error) {
      console.error("Error in getBookmarkedPosts:", error);
      return []; // Return empty array if user is not found or other errors occur
    }
  },
});

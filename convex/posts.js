import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

export const generateUploadUrl = mutation(async (ctx) => {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    
    // Check if user exists in database before allowing upload
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();
    
    if (!currentUser) {
      // Try to find by clerkId as fallback
      const userByClerkId = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .first();
      
      if (!userByClerkId) {
        throw new Error("User not found in database");
      }
    }
    
    return await ctx.storage.generateUploadUrl();
  } catch (error) {
    console.error("Error in generateUploadUrl:", error);
    throw error; // Re-throw for client-side handling
  }
});

export const createPost = mutation({
  args: {
    caption: v.optional(v.string()),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      //get current user
      const currentUser = await getAuthenticatedUser(ctx);

      //get image url from storage
      const imageUrl = await ctx.storage.getUrl(args.storageId);
      if (!imageUrl) throw new Error("Image not found");

      //create post
      const post = await ctx.db.insert("posts", {
        userId: currentUser._id,
        imageUrl,
        storageId: args.storageId,
        caption: args.caption,
        likes: 0,
        comments: 0,
      });

      //increment the number of posts of the user
      await ctx.db.patch(currentUser._id, {
        posts: (currentUser.posts || 0) + 1,
      });

      return post;
    } catch (error) {
      console.error("Error in createPost:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const getFeedPosts = query({
  handler: async (ctx) => {
    try {
      //get current user
      const currentUser = await getAuthenticatedUser(ctx);

      //get all posts
      const posts = await ctx.db.query("posts").order("desc").collect();
      if (!posts) return [];

      //get posts with userData and interaction status
      const postsWithInfo = await Promise.all(
        posts.map(async (post) => {
          //get author
          const postAuthor = await ctx.db.get(post.userId);

          //get interaction status
          const like = await ctx.db
            .query("likes")
            .withIndex("by_userId_and_postId", (q) =>
              q.eq("userId", currentUser._id).eq("postId", post._id)
            )
            .first();

          const bookmark = await ctx.db
            .query("bookmarks")
            .withIndex("by_userId_and_postId", (q) =>
              q.eq("userId", currentUser._id).eq("postId", post._id)
            )
            .first();

          return {
            ...post,
            author: {
              _id: postAuthor?._id,
              username: postAuthor?.username,
              image: postAuthor?.image,
            },
            liked: !!like,
            bookmarked: !!bookmark,
          };
        })
      );
      return postsWithInfo;
    } catch (error) {
      console.error("Error in getFeedPosts:", error);
      // Return empty array if user is not found or other errors occur
      return [];
    }
  },
});

export const toggleLike = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);

      const existing = await ctx.db
        .query("likes")
        .withIndex("by_userId_and_postId", (q) =>
          q.eq("userId", currentUser._id).eq("postId", args.postId)
        )
        .first();

      const post = await ctx.db.get(args.postId);
      if (!post) throw new Error("Post not found");

      if (existing) {
        await ctx.db.delete(existing._id);
        await ctx.db.patch(post._id, {
          likes: post.likes - 1,
        });
        return false;
      } else {
        await ctx.db.insert("likes", {
          userId: currentUser._id,
          postId: args.postId,
        });
        await ctx.db.patch(post._id, {
          likes: post.likes + 1,
        });

        if (currentUser._id !== post.userId) {
          await ctx.db.insert("notifications", {
            receiverId: post.userId,
            senderId: currentUser._id,
            type: "like",
            postId: args.postId,
          });
        }
        return true;
      }
    } catch (error) {
      console.error("Error in toggleLike:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const deletePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);

      const post = await ctx.db.get(args.postId);
      if (!post) throw new Error("Post not found");

      // verify ownership
      if (post.userId !== currentUser._id)
        throw new Error("Not authorized to delete this post");

      // delete associated likes
      const likes = await ctx.db
        .query("likes")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId))
        .collect();

      for (const like of likes) {
        await ctx.db.delete(like._id);
      }

      // delete associated comments
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId))
        .collect();

      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }

      // delete associated bookmarks
      const bookmarks = await ctx.db
        .query("bookmarks")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId))
        .collect();

      for (const bookmark of bookmarks) {
        await ctx.db.delete(bookmark._id);
      }

      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId))
        .collect();

      for (const notification of notifications) {
        await ctx.db.delete(notification._id);
      }

      // delete the storage file
      await ctx.storage.delete(post.storageId);

      // delete the post
      await ctx.db.delete(args.postId);

      // decrement user's post count by 1
      await ctx.db.patch(currentUser._id, {
        posts: Math.max(0, (currentUser.posts || 1) - 1),
      });
    } catch (error) {
      console.error("Error in deletePost:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const getPostsByUser = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getAuthenticatedUser(ctx);

      if (!user) throw new Error("User not found");

      const posts = await ctx.db
        .query("posts")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId || user._id))
        .collect();

      return posts;
    } catch (error) {
      console.error("Error in getPostsByUser:", error);
      return []; // Return empty array if user is not found or other errors occur
    }
  },
});

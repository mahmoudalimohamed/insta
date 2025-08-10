import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new task with the given text
export const createUser = mutation({
  args: {
    username: v.string(),
    fullname: v.string(),
    email: v.string(),
    bio: v.optional(v.string()),
    image: v.string(),
    clerkId: v.string(),
  },

  handler: async (ctx, args) => {
    try {
      // Log the arguments for debugging
      console.log("createUser called with args:", args);
      
      // Validate that email is not empty
      if (!args.email || args.email.trim() === "") {
        console.log("Cannot create user with empty email");
        throw new Error("Email cannot be empty");
      }

      // Validate other required fields
      if (!args.username || args.username.trim() === "") {
        console.log("Cannot create user with empty username");
        throw new Error("Username cannot be empty");
      }

      if (!args.fullname || args.fullname.trim() === "") {
        console.log("Cannot create user with empty fullname");
        throw new Error("Fullname cannot be empty");
      }

      if (!args.clerkId || args.clerkId.trim() === "") {
        console.log("Cannot create user with empty clerkId");
        throw new Error("ClerkId cannot be empty");
      }

      // check if user already exists by email
      const existingUserByEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
      
      if (existingUserByEmail) {
        console.log("User already exists by email:", args.email);
        return existingUserByEmail._id;
      }

      // check if user already exists by clerkId
      const existingUserByClerkId = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
        .first();
      
      if (existingUserByClerkId) {
        console.log("User already exists by clerkId:", args.clerkId);
        return existingUserByClerkId._id;
      }

      // create a user in db
      const userId = await ctx.db.insert("users", {
        username: args.username,
        fullname: args.fullname,
        email: args.email,
        bio: args.bio,
        image: args.image,
        clerkId: args.clerkId,
        followers: 0,
        following: 0,
        posts: 0,
      });

      console.log("User created successfully:", userId);
      return userId;
    } catch (error) {
      console.error("Error in createUser:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const getAuthenticatedUser = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  // Try to find user by email first
  let currentUser = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", identity.email))
    .first();

  // If not found by email, try to find by clerkId as fallback
  if (!currentUser && identity.subject) {
    currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
  }

  if (!currentUser) throw new Error("User not found");

  return currentUser;
};

export const getUserByClerkId = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    try {
      // Validate email argument
      if (!args.email || args.email.trim() === "") {
        throw new Error("Email cannot be empty");
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .unique();
      if (!user) throw new Error("User not found");
      return user;
    } catch (error) {
      console.error("Error in getUserByClerkId:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const updateProfile = mutation({
  args: {
    fullname: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);
      await ctx.db.patch(currentUser._id, {
        fullname: args.fullname,
        bio: args.bio,
      });
    } catch (error) {
      console.error("Error in updateProfile:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const getUserProfile = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    try {
      const user = await ctx.db.get(args.id);
      if (!user) throw new Error("User not found");
      return user;
    } catch (error) {
      console.error("Error in getUserProfile:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

export const isFollowing = query({
  args: { followingId: v.id("users") },
  handler: async (ctx, args) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);

      const follow = await ctx.db
        .query("follows")
        .withIndex("by_followerId_and_followingId", (q) =>
          q.eq("followerId", currentUser._id).eq("followingId", args.followingId)
        )
        .first();
      return !!follow;
    } catch (error) {
      console.error("Error in isFollowing:", error);
      return false; // Return false if user is not found or other errors occur
    }
  },
});

export const toggleFollow = mutation({
  args: { followingId: v.id("users") },
  handler: async (ctx, args) => {
    try {
      const currentUser = await getAuthenticatedUser(ctx);

      const existing = await ctx.db
        .query("follows")
        .withIndex("by_followerId_and_followingId", (q) =>
          q.eq("followerId", currentUser._id).eq("followingId", args.followingId)
        )
        .first();

      if (existing) {
        // unfollow
        await ctx.db.delete(existing._id);
        await updateFollowCounts(ctx, currentUser._id, args.followingId, false);
      } else {
        // follow
        await ctx.db.insert("follows", {
          followerId: currentUser._id,
          followingId: args.followingId,
        });
        await updateFollowCounts(ctx, currentUser._id, args.followingId, true);

        // create a notification
        await ctx.db.insert("notifications", {
          receiverId: args.followingId,
          senderId: currentUser._id,
          type: "follow",
        });
      }
    } catch (error) {
      console.error("Error in toggleFollow:", error);
      throw error; // Re-throw for client-side handling
    }
  },
});

const updateFollowCounts = async (ctx, followerId, followingId, isFollow) => {
  try {
    const follower = await ctx.db.get(followerId);
    const following = await ctx.db.get(followingId);

    if (follower && following) {
      await ctx.db.patch(followerId, {
        following: (follower.following || 0) + (isFollow ? 1 : -1),
      });
      await ctx.db.patch(followingId, {
        followers: (following.followers || 0) + (isFollow ? 1 : -1),
      });
    }
  } catch (error) {
    console.error("Error in updateFollowCounts:", error);
  }
};

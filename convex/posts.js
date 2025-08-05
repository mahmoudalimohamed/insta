import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

export const generateUploadUrl = mutation(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return await ctx.storage.generateUploadUrl();
});

export const createPost = mutation({
  args: {
    caption: v.optional(v.string()),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
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
      posts: currentUser.posts + 1,
    });

    return post;
  },
});

export const getFeedPosts = query({
  handler: async (ctx) => {
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
  },
});

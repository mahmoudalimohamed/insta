import { tokenCache } from "@/cache";
import { api } from "@/convex/_generated/api";
import { ClerkLoaded, ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { ConvexReactClient, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect } from "react";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env"
  );
}

// Component to handle automatic user creation in Convex
function UserCreationHandler() {
  const { isSignedIn, user, isLoaded } = useUser();
  const createUser = useMutation(api.users.createUser);

  useEffect(() => {
    // Only proceed if Clerk is loaded, user is signed in, and user object exists
    if (!isLoaded || !isSignedIn || !user) return;

    // Add error boundary for user object
    if (typeof user !== 'object') {
      console.error("UserCreationHandler: Invalid user object:", user);
      return;
    }

    console.log("UserCreationHandler: User state:", {
      isLoaded,
      isSignedIn,
      hasUser: !!user,
      hasEmail: !!user.primaryEmailAddress?.emailAddress,
      email: user.primaryEmailAddress?.emailAddress,
    });

    // Wait a bit for the user object to be fully populated
    const timer = setTimeout(() => {
      // Additional check to ensure all required user properties are available
      if (user.primaryEmailAddress?.emailAddress && user.id) {
        console.log("UserCreationHandler: Creating user with email:", user.primaryEmailAddress.emailAddress);
        // Create user in Convex database if they don't exist
        createUser({
          username: user.username || user.firstName || "user",
          fullname: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
          email: user.primaryEmailAddress.emailAddress,
          image: user.imageUrl || "https://via.placeholder.com/150",
          clerkId: user.id,
        }).catch((error) => {
          // User might already exist, which is fine
          console.log("User creation result:", error);
        });
      } else {
        console.log("UserCreationHandler: User data not fully available after delay:", {
          hasEmail: !!user.primaryEmailAddress?.emailAddress,
          hasId: !!user.id,
          email: user.primaryEmailAddress?.emailAddress,
          id: user.id,
        });
        
        // Try again after another delay if data is still not available
        const retryTimer = setTimeout(() => {
          if (user.primaryEmailAddress?.emailAddress && user.id) {
            console.log("UserCreationHandler: Retrying user creation after additional delay");
            createUser({
              username: user.username || user.firstName || "user",
              fullname: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
              email: user.primaryEmailAddress.emailAddress,
              image: user.imageUrl || "https://via.placeholder.com/150",
              clerkId: user.id,
            }).catch((error) => {
              console.log("User creation retry result:", error);
            });
          } else {
            console.log("UserCreationHandler: User data still not available after retry");
          }
        }, 2000); // Wait another 2 seconds

        return () => clearTimeout(retryTimer);
      }
    }, 1000); // Wait 1 second for user data to populate

    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn, user, createUser]);

  return null;
}

export default function ClerkAndConvexProvider({ children }) {
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ConvexProviderWithClerk useAuth={useAuth} client={convex}>
        <ClerkLoaded>
          <UserCreationHandler />
          {children}
        </ClerkLoaded>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

import { COLORS } from "@/constants/theme";
import { styles } from "@/styles/create.styles";
import { useUser } from "@clerk/clerk-expo"; // get the current authenticated user's data.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Import Expo APIs for interacting with the device's file system and image picker.
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

// Import the auto-generated Convex API and the `useMutation` hook to interact with the backend.
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";

export default function CreateScreen() {
  // --- Hooks and State ---
  // Initialize hooks for navigation and user data.
  const router = useRouter();
  const { user } = useUser();

  // Initialize state variables using the `useState` hook.
  // `caption`: Stores the text the user types for the post's caption.
  const [caption, setCaption] = useState("");
  // `selectedImage`: Stores the URI of the image chosen by the user. Initially null.
  const [selectedImage, setSelectedImage] = useState(null);
  // `isSharing`: A boolean flag to track if the post is currently being uploaded. Used for showing a loading indicator.
  const [isSharing, setIsSharing] = useState(false);

  // --- Functions ---

  // `pickImage`: An asynchronous function to open the device's image library.
  const pickImage = async () => {
    // Launches the image library.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images", // Only allow images to be selected.
      allowsEditing: true, // Allow the user to crop the image.
      aspect: [1, 1], // Enforce a square aspect ratio for the crop.
      quality: 0.8, // Compress the image to 80% quality to save space.
    });

    // If the user did not cancel the selection...
    if (!result.canceled) {
      // ...update the `selectedImage` state with the URI of the first selected asset.
      setSelectedImage(result.assets[0].uri);
    }
  };

  // `generateUploadUrl`: A Convex mutation hook to get a secure, one-time URL to upload the image to.
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);
  // `createPost`: A Convex mutation hook to create the post record in the database after the image is uploaded.
  const createPost = useMutation(api.posts.createPost);

  // `handleShare`: The main function that runs when the user taps "Share".
  const handleShare = async () => {
    // If no image is selected, do nothing.
    if (!selectedImage) return;

    try {
      // Set the loading state to true to disable buttons and show a spinner.
      setIsSharing(true);

      // 1. Get a temporary, secure URL from Convex for the file upload.
      const uploadUrl = await generateUploadUrl();

      // 2. Upload the image file from the device to the URL provided by Convex.
      const uploadResult = await FileSystem.uploadAsync(
        uploadUrl,
        selectedImage, // The local URI of the image file.
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          mimeType: "image/jpeg",
        }
      );

      // If the upload was not successful, throw an error.
      if (uploadResult.status !== 200) throw new Error("Upload failed");

      // 3. The body of the successful upload response contains the storage ID of the file in Convex.
      const { storageId } = JSON.parse(uploadResult.body);

      // 4. Call the `createPost` mutation to save the new post to the database with the storage ID and caption.
      await createPost({ storageId, caption });

      // Reset the state for the next post.
      setSelectedImage(null);
      setCaption("");

      // Navigate the user back to the main feed (the root of the tabs).
      router.push("/(tabs)");
    } catch (error) {
      console.log("Error sharing post");
    } finally {
      // No matter what happens (success or error), set the loading state back to false.
      setIsSharing(false);
    }
  };

  // --- Conditional Rendering ---

  // If no image has been selected yet, render the initial "image picker" view.
  if (!selectedImage) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          {/* A back button to navigate to the previous screen. */}
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Post</Text>
          {/* An empty view for spacing to keep the title centered. */}
          <View style={{ width: 28 }} />
        </View>

        {/* A large touchable area that prompts the user to pick an image. */}
        <TouchableOpacity
          style={styles.emptyImageContainer}
          onPress={pickImage}
        >
          <Ionicons name="image-outline" size={48} color={COLORS.grey} />
          <Text style={styles.emptyImageText}>Tap to select an image</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If an image IS selected, render the main post creation form.
  return (
    // This view adjusts its padding/height to avoid the on-screen keyboard.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <View style={styles.contentContainer}>
        {/* HEADER */}
        <View style={styles.header}>
          {/* A "close" button to cancel creation and reset the state. */}
          <TouchableOpacity
            onPress={() => {
              setSelectedImage(null);
              setCaption("");
            }}
            disabled={isSharing} // Disabled while uploading.
          >
            <Ionicons
              name="close-outline"
              size={28}
              color={isSharing ? COLORS.grey : COLORS.white}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Post</Text>
          {/* The "Share" button. */}
          <TouchableOpacity
            style={[
              styles.shareButton,
              isSharing && styles.shareButtonDisabled, // Apply disabled style when sharing.
            ]}
            disabled={isSharing || !selectedImage} // Disabled while sharing or if no image.
            onPress={handleShare}
          >
            {/* Conditionally render a spinner or the "Share" text. */}
            {isSharing ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.shareText}>Share</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* A scroll view for the main content. */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentOffset={{ x: 0, y: 100 }}
        >
          <View style={[styles.content, isSharing && styles.contentDisabled]}>
            {/* IMAGE SECTION */}
            <View style={styles.imageSection}>
              {/* The preview of the selected image. */}
              <Image
                source={selectedImage}
                style={styles.previewImage}
                contentFit="cover"
                transition={200}
              />
              {/* A button to change the selected image. */}
              <TouchableOpacity
                style={styles.changeImageButton}
                onPress={pickImage}
                disabled={isSharing}
              >
                <Ionicons name="image-outline" size={20} color={COLORS.white} />
                <Text style={styles.changeImageText}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* INPUT SECTION */}
            <View style={styles.inputSection}>
              <View style={styles.captionContainer}>
                {/* The current user's avatar. */}
                <Image
                  source={user?.imageUrl}
                  style={styles.userAvatar}
                  contentFit="cover"
                  transition={200}
                />
                {/* The text input for the caption. */}
                <TextInput
                  style={styles.captionInput}
                  placeholder="Write a caption..."
                  placeholderTextColor={COLORS.grey}
                  multiline
                  value={caption}
                  onChangeText={setCaption}
                  editable={!isSharing} // Not editable while uploading.
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

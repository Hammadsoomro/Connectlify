import mongoose from "mongoose";

const connectDB = async () => {
  try {
    console.log("🔍 Checking environment variables...");
    console.log("DB_URL exists:", !!process.env.DB_URL);
    console.log("DB_URL value:", process.env.DB_URL ? "SET" : "NOT_SET");
    
    // Set mongoose options for better connection handling
    mongoose.set("strictQuery", false);

    // Check if already connected (important for serverless)
    if (mongoose.connection.readyState === 1) {
      console.log("🔄 Using existing MongoDB connection");
      return;
    }

    if (!process.env.DB_URL) {
      console.error("❌ DB_URL environment variable is missing");
      console.error("Available env vars:", Object.keys(process.env).filter(key => key.includes('DB')));
      console.error("⚠️ MongoDB connection skipped - DB_URL not configured");
      return;
    }

    const conn = await mongoose.connect(process.env.DB_URL as string, {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      maxPoolSize: 10, // Maintain up to 10 socket connections
      family: 4, // Use IPv4, skip trying IPv6
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

    // Connection event listeners
    mongoose.connection.on("connected", () => {
      console.log("🔗 Mongoose connected to MongoDB");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ Mongoose connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("🔌 Mongoose disconnected");
    });
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
    console.error("⚠️ MongoDB connection failed - continuing without database");
    console.error("Note: Some features may not work without database connection");
  }
};

export default connectDB;

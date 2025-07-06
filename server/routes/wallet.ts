import { Response } from "express";
import Wallet from "../models/Wallet.js";
import BillingService from "../services/billingService.js";

// Get wallet balance and recent transactions
export const getWallet = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    // Only admins can have wallets
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can access wallets" });
    }

    let wallet = await Wallet.findOne({ userId });

    // Create wallet if it doesn't exist
    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: 0,
        currency: "USD",
        transactions: [],
      });
      await wallet.save();
    }

    // Get recent transactions (last 50)
    const recentTransactions = wallet.transactions
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 50);

    res.json({
      balance: wallet.balance,
      currency: wallet.currency,
      monthlyLimit: wallet.monthlyLimit,
      isActive: wallet.isActive,
      transactions: recentTransactions,
    });
  } catch (error) {
    console.error("Get wallet error:", error);
    res.status(500).json({ message: "Failed to fetch wallet information" });
  }
};

// Add funds to wallet
export const addFunds = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const { amount, paymentMethod = "manual" } = req.body;

    // Only admins can add funds
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can add funds" });
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    if (amount > 10000) {
      return res
        .status(400)
        .json({ message: "Maximum amount per transaction is $10,000" });
    }

    let wallet = await Wallet.findOne({ userId });

    // Create wallet if it doesn't exist
    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: 0,
        currency: "USD",
        transactions: [],
      });
    }

    // Add funds with transaction record
    await wallet.addFunds(
      amount,
      `Funds added via ${paymentMethod}`,
      `ADD_${Date.now()}`,
    );

    // Try to reactivate services if they were suspended
    try {
      await BillingService.reactivateServicesForAdmin(userId);
    } catch (error) {
      console.error("Error reactivating services:", error);
      // Don't fail the add funds operation for this
    }

    res.json({
      message: "Funds added successfully",
      balance: wallet.balance,
      transaction: wallet.transactions[wallet.transactions.length - 1],
    });
  } catch (error) {
    console.error("Add funds error:", error);
    res.status(500).json({ message: "Failed to add funds" });
  }
};

// Deduct funds (internal use for purchases, SMS, etc.)
export const deductFunds = async (
  userId: string,
  amount: number,
  description: string,
  reference?: string,
) => {
  try {
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (!wallet.isActive) {
      throw new Error("Wallet is not active");
    }

    if (!wallet.hasBalance(amount)) {
      throw new Error("Insufficient balance");
    }

    await wallet.deductFunds(amount, description, reference);
    return wallet;
  } catch (error) {
    throw error;
  }
};

// Check if user has sufficient balance
export const checkBalance = async (
  userId: string,
  amount: number,
): Promise<boolean> => {
  try {
    let wallet = await Wallet.findOne({ userId });

    // Create wallet if it doesn't exist
    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: 0,
        currency: "USD",
        transactions: [],
        isActive: true,
      });
      await wallet.save();
      console.log(`Created new wallet for user ${userId}`);
      return false; // New wallet has 0 balance
    }

    if (!wallet.isActive) {
      return false;
    }

    return wallet.hasBalance(amount);
  } catch (error) {
    console.error("Error checking wallet balance:", error);
    return false;
  }
};

// Get wallet statistics
export const getWalletStats = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can access wallet stats" });
    }

    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.json({
        totalSpent: 0,
        totalAdded: 0,
        monthlySpending: 0,
        transactionCount: 0,
      });
    }

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    let totalSpent = 0;
    let totalAdded = 0;
    let monthlySpending = 0;

    wallet.transactions.forEach((transaction) => {
      if (transaction.type === "credit") {
        totalAdded += transaction.amount;
      } else {
        totalSpent += transaction.amount;

        // Check if transaction is from current month
        if (new Date(transaction.createdAt) >= currentMonth) {
          monthlySpending += transaction.amount;
        }
      }
    });

    res.json({
      totalSpent,
      totalAdded,
      monthlySpending,
      transactionCount: wallet.transactions.length,
      currentBalance: wallet.balance,
    });
  } catch (error) {
    console.error("Get wallet stats error:", error);
    res.status(500).json({ message: "Failed to fetch wallet statistics" });
  }
};

// Update monthly limit
export const updateMonthlyLimit = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const { limit } = req.body;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can update monthly limit" });
    }

    if (limit < 0) {
      return res
        .status(400)
        .json({ message: "Monthly limit cannot be negative" });
    }

    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: 0,
        currency: "USD",
        transactions: [],
        monthlyLimit: limit,
      });
    } else {
      wallet.monthlyLimit = limit;
    }

    await wallet.save();

    res.json({
      message: "Monthly limit updated successfully",
      monthlyLimit: wallet.monthlyLimit,
    });
  } catch (error) {
    console.error("Update monthly limit error:", error);
    res.status(500).json({ message: "Failed to update monthly limit" });
  }
};

// Get billing summary
export const getBillingSummary = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can access billing summary" });
    }

    const billingSummary = await BillingService.getAdminBillingSummary(userId);
    res.json(billingSummary);
  } catch (error) {
    console.error("Get billing summary error:", error);
    res.status(500).json({ message: "Failed to fetch billing summary" });
  }
};

// Manual trigger for monthly billing (for testing)
export const triggerMonthlyBilling = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can trigger billing" });
    }

    await BillingService.processAdminMonthlyCharges(userId);
    res.json({ message: "Monthly billing processed successfully" });
  } catch (error) {
    console.error("Manual billing trigger error:", error);
    res.status(500).json({
      message: error.message || "Failed to process monthly billing",
    });
  }
};

// Export all functions for use in routes
export default {
  getWallet,
  addFunds,
  deductFunds,
  checkBalance,
  getWalletStats,
  updateMonthlyLimit,
  getBillingSummary,
  triggerMonthlyBilling,
};

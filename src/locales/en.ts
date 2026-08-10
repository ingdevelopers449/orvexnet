export const en = {
    // Main Menu
    welcome_title: "✨ <b>WELCOME TO ORVEX NET!</b> ✨",
    welcome_desc: "🚀 <i>The best digital products platform.</i>\n\n🔹 <b>Automatic Delivery</b> ⚡️\n🔹 <b>Premium Support</b> 🛡️\n🔹 <b>Unbeatable Prices</b> 💎",
    balance_label: "💰 <b>Your current balance:</b>",
    select_option: "👇 <b>Select an option to begin:</b>",
    btn_catalog: "🎯 VIEW PRODUCT CATALOG",
    btn_recharge: "💰 Add Balance",
    btn_profile: "⚡ My Profile",
    btn_support: "🔔 Contact Support",
    btn_language: "🌐 Change Language",

    // Catalog
    catalog_title: "🛍️ <b>PRODUCT CATALOG</b>",
    catalog_desc: "<i>Select a product to view its details:</i>",
    btn_back_menu: "🔙 Main Menu",
    btn_back_catalog: "🔙 Back to Catalog",
    stock_label: "📦 Stock",
    empty_catalog: "😔 Sorry, there are no products available right now.",

    // Checkout
    checkout_title: "🛒 <b>CHECKOUT</b>",
    unit_price: "💰 <b>Unit Price:</b>",
    available_stock: "📦 <b>Available Stock:</b>",
    selected_qty: "🛒 <b>Selected Quantity:</b>",
    total_amount: "💵 <b>Total Amount:</b>",
    select_qty_desc: "<i>Select quantity using ➖ and ➕ buttons:</i>",
    btn_confirm_buy: "🛒 CONFIRM PURCHASE",
    err_product_not_found: "Error: Product not found",
    err_product_inactive: "❌ This product is no longer active.",
    err_out_of_stock: "❌ Out of stock.",
    err_insufficient_funds: "❌ *Insufficient funds*\n\nAmount to pay: ${total}\nYour balance: ${balance}\n\nPlease add funds using the button below.",

    // Post-Purchase
    buy_success: "PURCHASE SUCCESSFUL!",
    order_id: "Order ID:",
    product_label: "Product:",
    amount_paid: "Amount paid:",
    balance_remaining: "Remaining balance:",
    auto_delivery_title: "Here are your products:\n\n",
    manual_delivery_title: "Manual Delivery: An admin has been notified and will contact you shortly to deliver your products.\n\n",
    thanks_for_buying: "Thank you for your purchase!",
    btn_continue_buying: "🛍️ Continue Shopping",
    btn_talk_seller: "📞 Talk to Seller",
    err_inventory_mismatch: "❌ Error: Inventory inconsistency. Not enough accounts available.",
    
    // Profile & History
    profile_title: "👤 <b>USER PROFILE</b>",
    profile_id: "🆔 <b>Telegram ID:</b>",
    profile_user: "👤 <b>Username:</b>",
    btn_history: "📜 Purchase History",
    history_empty: "You have no registered purchases.",
    history_title: "📜 <b>YOUR PURCHASE HISTORY</b>",
    history_desc: "<i>Select a product to view purchased accounts:</i>",
    history_item_title: "🧾 <b>HISTORY: {productName}</b>",
    history_tx_count: "🛍️ <b>Transactions made:</b>",
    history_orders: "📋 <b>Your Orders:</b>",
    history_accounts: "🎁 <b>Delivered Accounts/Items:</b>",
    history_content: "🎁 <b>Delivered Content:</b>",
    history_manual: "⏳ <b>Delivery Type:</b> Manual (support).",
    btn_back_history: "🔙 Back to History",

    // Recharges
    recharge_menu: "💳 <b>ADD BALANCE</b>\n\nChoose a payment method:",
    recharge_binance: "🟡 Binance Pay (Auto)",
    recharge_manual: "🏦 Other Methods (Manual)",
    
    // Binance Pay
    binance_title: "🟡 <b>Recharge with Binance Pay</b>\n\nEnter the exact amount in USD you wish to recharge:",
    binance_invalid: "❌ Invalid amount. Enter a number (e.g. 5.50).",
    binance_min: "❌ Minimum amount is $1.00 USD.",
    binance_creating: "Generating payment...",
    binance_pay_title: "🟡 <b>PAYMENT GENERATED - BINANCE PAY</b>",
    binance_pay_amount: "💰 <b>Amount to pay:</b>",
    binance_pay_order: "🧾 <b>Order:</b>",
    binance_pay_desc: "👉 <i>Pay using the link or scan the QR in the Binance app.</i>\n⏳ <i>Payment will be automatically verified in 2 minutes.</i>",
    binance_btn_pay: "🔗 PAY IN BINANCE",
    binance_btn_cancel: "❌ Cancel Payment",
    binance_cancelled: "❌ Payment cancelled.",

    // Manual Recharge
    manual_title: "🏦 <b>MANUAL RECHARGE</b>\n\nAvailable methods:\n\n{methods}\n\n<i>Send the payment receipt to the admin.</i>",
    
    // Misc
    btn_cancel: "❌ Cancel",
    // Recharge manual binance
    recharge_binance_title: "💰 *Binance Pay Deposit*\n\n*Pay ID:* `{payId}`\n*Binance Name:* `{binanceName}`\n\n✅ Send the exact amount in USDT to the Pay ID above.\n✅ Copy your Binance Order ID.\n✅ Paste your Binance Order ID here.\n\n⚠️ *Only confirmed payments sent to this Binance Pay ID will be credited.*\n\n🎁 *Bonus:*\n\n$50+ ➔ +2%\n$100+ ➔ +5%\n\n*Send your Binance Order ID below:*",
    recharge_help_btn: "🆔 Where do I find the Order ID?",
    recharge_cancel: "❌ Cancel",
    recharge_cancelled: "❌ Operation cancelled.",
    recharge_help_msg: "📸 *The Order ID is a 16-digit number that Binance provides after making a payment.*",
    recharge_invalid_id: "❌ The Order ID must be at least 10 digits. Please try again.",
    recharge_checking: "🔍 Verifying payment with Order ID: ",
    recharge_success: "✅ *RECHARGE SUCCESSFULLY CONFIRMED!*\n\n🧾 *Order ID:* `{txId}`\n💰 *Amount deposited:* ${amountPaid} USD\n",
    recharge_bonus: "🎁 *Bonus applied:* +{bonusPercent}% (+${bonusAmount} USD)\n",
    recharge_success_total: "💵 *Total credited:* ${totalUsdt} USD\n💼 *Your new balance is:* ${newBalance} USD\n\n🎉 Thank you for trusting us!",
    recharge_pending: "⚠️ *Attention*\n\nWe couldn't verify your payment automatically at this time. The recharge has been left in *pending* status.\n\nAn admin will review this Order ID manually shortly.",
    recharge_used_id: "❌ Error: This Order ID has already been used or credited previously.",
    recharge_contact_support: "📞 Contact Support",
};

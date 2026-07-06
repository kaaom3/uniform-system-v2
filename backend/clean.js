const mongoose = require('mongoose');
const Request = require('./models/Request');
const Stock = require('./models/Stock');
const StockTransaction = require('./models/StockTransaction');

async function cleanRecentImports() {
    try {
        await mongoose.connect('mongodb+srv://kaaom3:Kaaom321A@cluster0.fx7nlup.mongodb.net/uniform_db?retryWrites=true&w=majority');
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60000);
        
        // Find recent requests from CSV import
        const reqs = await Request.find({ 
            createdAt: { $gte: thirtyMinsAgo },
            reason: { $regex: /นำเข้าข้อมูล/ } // "นำเข้าข้อมูลย้อนหลัง (Import CSV)"
        });
        
        console.log(`Found ${reqs.length} recent imported requests.`);
        if (reqs.length === 0) {
            console.log("No duplicate imports found.");
            process.exit(0);
        }

        // We will keep the FIRST occurrence of each (username + itemType + size), and delete the rest
        // Or if the user wants to delete ALL of them to start fresh, we can just delete all of them and restore stock!
        // The safest is to delete all requests created in the last 30 minutes from CSV, and restore the stock.
        
        for (const req of reqs) {
            console.log(`Reverting: ${req.requesterName} - ${req.itemType} (${req.size}) Qty: ${req.quantity}`);
            
            // Delete the request
            await Request.findByIdAndDelete(req._id);
            
            // Restore stock
            const stock = await Stock.findOne({ itemType: req.itemType, size: req.size });
            if (stock) {
                if (req.notes.includes('มือสอง')) {
                    stock.usedStock += req.quantity;
                } else {
                    stock.newStock += req.quantity;
                }
                await stock.save();
                
                // Add log for restoration
                await new StockTransaction({
                    itemType: req.itemType,
                    size: req.size,
                    transactionType: req.notes.includes('มือสอง') ? 'IN-USED' : 'IN',
                    quantity: req.quantity,
                    reason: `คืนสต๊อก (ยกเลิกการนำเข้าซ้ำ ${req.requestId})`,
                    adminUser: 'System (Fix)'
                }).save();
            }
        }
        
        console.log("Successfully reverted all recent imports.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
cleanRecentImports();

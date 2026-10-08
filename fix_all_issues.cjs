const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function main() {
    try {
        console.log('=== بدء تطبيق كل التعديلات المتبقية ===\n');

        // أولاً: شوف الجداول الموجودة
        const tables = await all(`SELECT name FROM sqlite_master WHERE type='table'`);
        console.log('الجداول الموجودة:', tables.map(t => t.name).join(', '));

        // شوف بنية جدول الأسعار
        const priceTableName = tables.find(t => t.name === 'product_prices') ? 'product_prices' :
                               tables.find(t => t.name === 'items') ? 'items' : null;
        console.log('جدول الأسعار:', priceTableName);

        if (priceTableName) {
            const cols = await all(`PRAGMA table_info(${priceTableName})`);
            console.log(`أعمدة ${priceTableName}:`, cols.map(c => c.name).join(', '));
        }

        // =============================================
        // 1. تصليح sort_order الأقسام
        // =============================================
        console.log('\n--- 1. تصليح ترتيب الأقسام ---');

        // Ice Coffee → 15 (بعد Hot Coffee مباشرة)
        await run(`UPDATE categories SET sort_order = 15 WHERE category_id = 10`);
        console.log('✓ Ice Coffee → sort_order = 15');

        // Warm Drinks → 95 (بعد Fresh Juices اللي هي 90)
        await run(`UPDATE categories SET sort_order = 95 WHERE category_id = 2`);
        console.log('✓ Warm Drinks → sort_order = 95');

        // =============================================
        // 2. تصليح أسعار Ice Coffee
        // =============================================
        console.log('\n--- 2. تصليح أسعار Ice Coffee (كلهم 109 ما عدا Ice Latte) ---');

        // شوف المنتجات الحالية في Ice Coffee
        const iceProducts = await all(`SELECT product_id, product_name FROM products WHERE category_id = 10`);
        console.log('منتجات Ice Coffee:', iceProducts.map(p => `${p.product_id}:${p.product_name.split('|')[0].trim()}`).join(', '));

        if (priceTableName === 'product_prices') {
            // بنية: product_id, size_id, price
            // size_id = 2 = M
            const iceToFix = [68, 69, 70, 71, 73, 74]; // كلهم ما عدا Ice Latte (67)
            // Ice Biscoff Latte (72) - خليها 109 كمان لو موجودة
            const allIceIds = iceProducts.map(p => p.product_id).filter(id => id !== 67);
            
            for (const productId of allIceIds) {
                const existing = await all(`SELECT * FROM product_prices WHERE product_id = ? AND size_id = 2`, [productId]);
                if (existing.length > 0) {
                    const r = await run(`UPDATE product_prices SET price = 109 WHERE product_id = ? AND size_id = 2`, [productId]);
                    console.log(`  ✓ Product ${productId}: → 109 جنيه (تم تحديث ${r.changes} سجل)`);
                } else {
                    // جرب size_id = 1 أو أي size موجودة
                    const anyPrice = await all(`SELECT * FROM product_prices WHERE product_id = ?`, [productId]);
                    if (anyPrice.length > 0) {
                        await run(`UPDATE product_prices SET price = 109 WHERE product_id = ?`, [productId]);
                        console.log(`  ✓ Product ${productId}: → 109 جنيه (حدّث كل sizes)`);
                    } else {
                        await run(`INSERT INTO product_prices (product_id, size_id, price) VALUES (?, 2, 109)`, [productId]);
                        console.log(`  ✓ Product ${productId}: أضاف سعر 109 جنيه`);
                    }
                }
            }
        } else if (priceTableName === 'items') {
            // جرب البنية القديمة
            const r = await run(`
                UPDATE items SET price = 109 
                WHERE product_id IN (
                    SELECT product_id FROM products WHERE category_id = 10 AND product_id != 67
                )
            `);
            console.log(`  ✓ تم تحديث ${r.changes} سجل → 109 جنيه (ما عدا Ice Latte)`);
        }

        // =============================================
        // 3. مسح Patisserie من Dessert and Bakery
        // =============================================
        console.log('\n--- 3. مسح منتجات Patisserie من Dessert and Bakery ---');

        const patisserieIds = [115, 116, 117, 118, 119, 120];
        const patisserieNames = ['Plain Patisserie', 'Cheese Patisserie', 'White Cheese Patisserie', 'Luncheon Patisserie', 'Smoked Turkey Patisserie', 'Mixed Cheese Patisserie'];

        for (let i = 0; i < patisserieIds.length; i++) {
            const id = patisserieIds[i];
            const existing = await all(`SELECT product_name FROM products WHERE product_id = ?`, [id]);
            if (existing.length > 0) {
                // مسح الأسعار أولاً
                if (priceTableName === 'product_prices') {
                    await run(`DELETE FROM product_prices WHERE product_id = ?`, [id]);
                } else if (priceTableName === 'items') {
                    await run(`DELETE FROM items WHERE product_id = ?`, [id]);
                }
                // مسح المنتج
                await run(`DELETE FROM products WHERE product_id = ?`, [id]);
                console.log(`  ✓ تم مسح: ${existing[0].product_name}`);
            } else {
                console.log(`  - ${patisserieNames[i]} (id=${id}): غير موجود`);
            }
        }

        // =============================================
        // 4. النتائج النهائية
        // =============================================
        console.log('\n=== ✅ النتائج النهائية ===\n');

        const cats = await all(`SELECT category_id, category_name, sort_order FROM categories ORDER BY sort_order`);
        console.log('ترتيب الأقسام الجديد:');
        cats.forEach(c => console.log(`  [${String(c.sort_order).padStart(3)}] ${c.category_name}`));

        console.log('\nأسعار Ice Coffee:');
        if (priceTableName === 'product_prices') {
            const icePrices = await all(`
                SELECT p.product_name, pp.price, s.size_name
                FROM products p
                JOIN product_prices pp ON p.product_id = pp.product_id
                JOIN sizes s ON pp.size_id = s.size_id
                WHERE p.category_id = 10
                ORDER BY p.product_id
            `);
            icePrices.forEach(p => console.log(`  ${p.product_name.split('|')[0].trim()} (${p.size_name}): ${p.price} جنيه`));
        } else if (priceTableName === 'items') {
            const icePrices = await all(`
                SELECT p.product_name, i.price, i.size
                FROM products p
                JOIN items i ON i.product_id = p.product_id
                WHERE p.category_id = 10
                ORDER BY p.product_id
            `);
            icePrices.forEach(p => console.log(`  ${p.product_name.split('|')[0].trim()} (${p.size}): ${p.price} جنيه`));
        }

        console.log('\nمنتجات Dessert and Bakery المتبقية:');
        const dessertAfter = await all(`SELECT product_id, product_name FROM products WHERE category_id = 13 ORDER BY product_id`);
        dessertAfter.forEach(p => console.log(`  ${p.product_id}: ${p.product_name.split('|')[0].trim()}`));

        console.log('\n🎉 تم تطبيق كل التعديلات بنجاح!');

    } catch (err) {
        console.error('❌ خطأ:', err.message);
        console.error(err.stack);
    } finally {
        db.close();
    }
}

main();

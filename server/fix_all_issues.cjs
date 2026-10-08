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

        // شوف الجداول الموجودة
        const tables = await all(`SELECT name FROM sqlite_master WHERE type='table'`);
        console.log('الجداول:', tables.map(t => t.name).join(', '));

        const hasPrices = tables.find(t => t.name === 'product_prices');
        const hasItems = tables.find(t => t.name === 'items');
        const priceTable = hasPrices ? 'product_prices' : hasItems ? 'items' : null;
        console.log('جدول الأسعار:', priceTable);

        if (priceTable) {
            const cols = await all(`PRAGMA table_info(${priceTable})`);
            console.log(`أعمدة ${priceTable}:`, cols.map(c => c.name).join(', '));
        }

        // =============================================
        // 1. تصليح sort_order الأقسام
        // =============================================
        console.log('\n--- 1. تصليح ترتيب الأقسام ---');

        // Ice Coffee (id=10) → 15 (بعد Hot Coffee=10 مباشرة)
        const r1 = await run(`UPDATE categories SET sort_order = 15 WHERE category_id = 10`);
        console.log(`✓ Ice Coffee → sort_order = 15 (${r1.changes} سجل)`);

        // Warm Drinks (id=2) → 95 (بعد Fresh Juices=90)
        const r2 = await run(`UPDATE categories SET sort_order = 95 WHERE category_id = 2`);
        console.log(`✓ Warm Drinks → sort_order = 95 (${r2.changes} سجل)`);

        // =============================================
        // 2. تصليح أسعار Ice Coffee
        // =============================================
        console.log('\n--- 2. تصليح أسعار Ice Coffee ---');

        const iceProducts = await all(`SELECT product_id, product_name FROM products WHERE category_id = 10 ORDER BY product_id`);
        console.log('منتجات Ice Coffee الحالية:');
        iceProducts.forEach(p => console.log(`  ${p.product_id}: ${p.product_name.split('|')[0].trim()}`));

        if (priceTable === 'product_prices') {
            // بنية: product_id, size_id, price (size_id=2 هو M)
            for (const product of iceProducts) {
                if (product.product_id === 67) {
                    console.log(`  [SKIP] Ice Latte (67) - تبقى زي ما هي`);
                    continue;
                }
                const prices = await all(`SELECT * FROM product_prices WHERE product_id = ?`, [product.product_id]);
                if (prices.length > 0) {
                    const r = await run(`UPDATE product_prices SET price = 109 WHERE product_id = ?`, [product.product_id]);
                    console.log(`  ✓ ${product.product_name.split('|')[0].trim()} → 109 جنيه (${r.changes} سجل)`);
                } else {
                    // أضف سعر M
                    const sizeRows = await all(`SELECT size_id FROM sizes WHERE size_name = 'M'`);
                    const sizeId = sizeRows.length > 0 ? sizeRows[0].size_id : 2;
                    await run(`INSERT INTO product_prices (product_id, size_id, price) VALUES (?, ?, 109)`, [product.product_id, sizeId]);
                    console.log(`  ✓ ${product.product_name.split('|')[0].trim()} → أضاف 109 جنيه`);
                }
            }
        } else if (priceTable === 'items') {
            for (const product of iceProducts) {
                if (product.product_id === 67) {
                    console.log(`  [SKIP] Ice Latte (67) - تبقى زي ما هي`);
                    continue;
                }
                const r = await run(`UPDATE items SET price = 109 WHERE product_id = ?`, [product.product_id]);
                console.log(`  ✓ ${product.product_name.split('|')[0].trim()} → 109 جنيه (${r.changes} سجل)`);
            }
        }

        // =============================================
        // 3. مسح Patisserie من Dessert and Bakery
        // =============================================
        console.log('\n--- 3. مسح منتجات Patisserie (id 115-120) ---');

        const patisserieIds = [115, 116, 117, 118, 119, 120];
        for (const id of patisserieIds) {
            const rows = await all(`SELECT product_name FROM products WHERE product_id = ?`, [id]);
            if (rows.length > 0) {
                if (priceTable === 'product_prices') {
                    await run(`DELETE FROM product_prices WHERE product_id = ?`, [id]);
                } else if (priceTable === 'items') {
                    await run(`DELETE FROM items WHERE product_id = ?`, [id]);
                }
                await run(`DELETE FROM products WHERE product_id = ?`, [id]);
                console.log(`  ✓ مسح: ${rows[0].product_name}`);
            } else {
                console.log(`  - product_id=${id}: غير موجود`);
            }
        }

        // =============================================
        // 4. النتائج النهائية
        // =============================================
        console.log('\n=== ✅ النتائج النهائية ===\n');

        const cats = await all(`SELECT category_id, category_name, sort_order FROM categories ORDER BY sort_order`);
        console.log('ترتيب الأقسام الجديد:');
        cats.forEach(c => console.log(`  [${String(c.sort_order).padStart(3)}] ${c.category_name} (id=${c.category_id})`));

        console.log('\nأسعار Ice Coffee:');
        if (priceTable === 'product_prices') {
            const icePrices = await all(`
                SELECT p.product_name, pp.price, s.size_name
                FROM products p
                JOIN product_prices pp ON p.product_id = pp.product_id
                JOIN sizes s ON pp.size_id = s.size_id
                WHERE p.category_id = 10
                ORDER BY p.product_id
            `);
            icePrices.forEach(p => console.log(`  ${p.product_name.split('|')[0].trim()} (${p.size_name}): ${p.price} جنيه`));
        } else if (priceTable === 'items') {
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

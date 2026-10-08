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
        console.log('=== بدء تطبيق التعديلات على قاعدة البيانات ===\n');

        // =============================================
        // 1. تعديل sort_order للأقسام
        // الترتيب: Hot Coffee=10, Ice Coffee=15, Shakes=21, Smoothies=25
        // Boba Smoothie=30, Boba Soft=35, Boba Milkshake=40, Frappe=45, Matcha=50
        // =============================================
        console.log('1. تحديث ترتيب الأقسام...');
        await run(`UPDATE categories SET sort_order = 15 WHERE category_id = 10`);  // Ice Coffee
        await run(`UPDATE categories SET sort_order = 21 WHERE category_id = 3`);   // Shakes
        await run(`UPDATE categories SET sort_order = 25 WHERE category_id = 11`);  // Smoothies
        await run(`UPDATE categories SET sort_order = 30 WHERE category_id = 18`);  // Boba Smoothie
        await run(`UPDATE categories SET sort_order = 35 WHERE category_id = 6`);   // Boba Soft
        await run(`UPDATE categories SET sort_order = 40 WHERE category_id = 17`);  // Boba Milkshake
        await run(`UPDATE categories SET sort_order = 45 WHERE category_id = 4`);   // Frappe
        await run(`UPDATE categories SET sort_order = 50 WHERE category_id = 5`);   // Matcha
        console.log('   ✅ تم تحديث ترتيب الأقسام\n');

        // =============================================
        // 2. ترتيب منتجات Hot Coffee: القهوة التركية أولاً ثم الإسبريسو
        // product_id=9: Turkish Coffee, product_id=10: Turkish Coffee with Milk, product_id=1: Espresso
        // =============================================
        console.log('2. تحديث ترتيب منتجات Hot Coffee...');
        await run(`UPDATE products SET sort_order = 1 WHERE product_id = 9`);   // Turkish Coffee
        await run(`UPDATE products SET sort_order = 2 WHERE product_id = 10`);  // Turkish Coffee with Milk
        await run(`UPDATE products SET sort_order = 3 WHERE product_id = 1`);   // Espresso
        console.log('   ✅ تم تحديث ترتيب منتجات Hot Coffee\n');

        // =============================================
        // 3. Ice Coffee: حذف Ice Biscoff Latte + تحديث الأسعار لـ 109 ماعدا Ice Latte
        // =============================================
        console.log('3. تحديث أسعار Ice Coffee...');

        // جلب منتجات Ice Coffee
        const iceCoffeeProducts = await all(`
            SELECT product_id, product_name FROM products WHERE category_id = 10
        `);
        console.log('   منتجات Ice Coffee الحالية:');
        iceCoffeeProducts.forEach(p => console.log(`     ${p.product_id}: ${p.product_name}`));

        // حذف Ice Biscoff Latte إذا وُجد
        const biscoff = iceCoffeeProducts.find(p => p.product_name.toLowerCase().includes('biscoff'));
        if (biscoff) {
            await run(`DELETE FROM items WHERE product_id = ?`, [biscoff.product_id]);
            await run(`DELETE FROM products WHERE product_id = ?`, [biscoff.product_id]);
            console.log(`   ✅ تم حذف: ${biscoff.product_name}`);
        } else {
            console.log('   ℹ️ Ice Biscoff Latte غير موجود مسبقاً');
        }

        // تحقق من اسم جدول الأسعار/الأحجام
        const tables = await all(`SELECT name FROM sqlite_master WHERE type='table'`);
        console.log('   الجداول الموجودة:', tables.map(t => t.name).join(', '));

        // تحديث أسعار كل منتجات Ice Coffee لـ 109 ماعدا Ice Latte (product_id=67)
        const itemsInfo = await all(`PRAGMA table_info(items)`);
        console.log('   أعمدة جدول items:', itemsInfo.map(c => c.name).join(', '));

        const result = await run(`
            UPDATE items SET price = 109 
            WHERE product_id IN (
                SELECT product_id FROM products WHERE category_id = 10 AND product_id != 67
            )
        `);
        console.log(`   ✅ تم تحديث ${result.changes} سعر لـ 109 جنيه (ماعدا Ice Latte)\n`);

        // =============================================
        // 4. Dessert and Bakery: حذف 10 منتجات
        // =============================================
        console.log('4. حذف منتجات من Dessert and Bakery...');

        const productsToDelete = [
            'Chocolate Croissant',
            'Lotus Croissant',
            'Cheese Croissant',
            'Mixed Cheese Croissant',
            'Plain Patisserie',
            'Cheese Patisserie',
            'White Cheese Patisserie',
            'Luncheon Patisserie',
            'Smoked Turkey Patisserie',
            'Mixed Cheese Patisserie',
        ];

        const dessertProducts = await all(`
            SELECT product_id, product_name FROM products WHERE category_id = 13
        `);
        console.log(`   المنتجات الحالية في Dessert (${dessertProducts.length}):`);
        dessertProducts.forEach(p => console.log(`     ${p.product_id}: ${p.product_name}`));

        for (const targetName of productsToDelete) {
            const match = dessertProducts.find(p =>
                p.product_name.toLowerCase().includes(targetName.toLowerCase())
            );
            if (match) {
                await run(`DELETE FROM items WHERE product_id = ?`, [match.product_id]);
                await run(`DELETE FROM products WHERE product_id = ?`, [match.product_id]);
                console.log(`   ✅ تم حذف: ${match.product_name}`);
            } else {
                console.log(`   ⚠️ لم يُعثر على: ${targetName}`);
            }
        }

        // =============================================
        // 5. النتائج النهائية
        // =============================================
        console.log('\n=== ✅ النتائج النهائية ===');

        const cats = await all(`SELECT category_id, category_name, sort_order FROM categories ORDER BY sort_order`);
        console.log('\nترتيب الأقسام:');
        cats.forEach(c => console.log(`  [${c.sort_order}] ${c.category_name}`));

        const iceCoffeeAfter = await all(`
            SELECT p.product_id, p.product_name, i.price, i.size FROM products p
            JOIN items i ON i.product_id = p.product_id
            WHERE p.category_id = 10
        `);
        console.log('\nمنتجات Ice Coffee بعد التعديل:');
        iceCoffeeAfter.forEach(p => console.log(`  ${p.product_name} (${p.size}): ${p.price} جنيه`));

        const dessertAfter = await all(`
            SELECT p.product_id, p.product_name FROM products p
            WHERE p.category_id = 13 ORDER BY p.sort_order, p.product_id
        `);
        console.log(`\nمنتجات Dessert and Bakery بعد التعديل (${dessertAfter.length} منتج):`);
        dessertAfter.forEach(p => console.log(`  ${p.product_name}`));

        console.log('\n🎉 تم تطبيق كل التعديلات بنجاح!');

    } catch (err) {
        console.error('❌ خطأ:', err.message);
    } finally {
        db.close();
    }
}

main();

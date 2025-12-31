// --- 1. IDENTITY & STATE ---
// Create/Retrieve a unique ID for this browser session
let userId = localStorage.getItem('store_user_id') || "user_" + Math.random().toString(36).substr(2, 9);
localStorage.setItem('store_user_id', userId);

let shoppingCart = [];

// --- 2. FIREBASE CORE FUNCTIONS ---

// Function to save the cart to Firebase
const saveCart = async () => {
    try {
        await db.collection("carts").doc(userId).set({
            items: shoppingCart,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Cart synced to Firebase.");
    } catch (error) {
        console.error("Error saving to Firebase:", error);
    }
};

// Function to load the cart from Firebase
const loadCart = async () => {
    try {
        const doc = await db.collection("carts").doc(userId).get();
        
        if (doc.exists) {
            shoppingCart = doc.data().items || [];
            console.log("Cart loaded from Firebase!");
        } else {
            shoppingCart = [];
            console.log("No cloud cart found, starting fresh.");
        }
        
        // Update UI after data arrives
        updateCartCounter();
        if (document.getElementById('cart-container')) {
            renderCart();
        }
    } catch (error) {
        console.error("Error connecting to Firebase:", error);
    }
};

// --- 3. UI HELPERS ---

const updateCartCounter = () => {
    const cartCounter = document.getElementById('cart-counter');
    if (cartCounter) {
        const totalQuantity = shoppingCart.reduce((total, item) => total + item.quantity, 0);
        cartCounter.textContent = totalQuantity;
    }
};

const deleteItem = async (productId) => {
    shoppingCart = shoppingCart.filter(item => item.id !== productId);
    updateCartCounter();
    renderCart(); 
    await saveCart(); // Sync to cloud
};

const changeQuantity = async (productId, delta) => {
    const item = shoppingCart.find(item => item.id === productId);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            await deleteItem(productId);
            return;
        }
        updateCartCounter();
        renderCart(); 
        await saveCart(); // Sync to cloud
    }
};

// --- 4. RENDER CART PAGE ---

const renderCart = () => {
    const cartContainer = document.getElementById('cart-container');
    const cartTotalElement = document.getElementById('cart-total');
    const checkoutButton = document.getElementById('checkout-button');

    if (!cartContainer || !cartTotalElement) return;

    cartContainer.innerHTML = '';
    let total = 0;

    if (shoppingCart.length === 0) {
        cartContainer.innerHTML = '<p style="text-align: center; padding: 2rem;">Your cart is empty. <a href="products.html" style="color: var(--primary-color);">Start shopping!</a></p>';
        cartTotalElement.textContent = '$0.00';
        if (checkoutButton) checkoutButton.disabled = true;
        return;
    }

    if (checkoutButton) checkoutButton.disabled = false;
    
    shoppingCart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const cartItemDiv = document.createElement('div');
        cartItemDiv.classList.add('cart-item');
        cartItemDiv.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <div class="cart-item-details">
                <h4>${item.name}</h4>
                <p class="price">$${item.price.toFixed(2)}</p>
                <div class="quantity-controls" data-id="${item.id}">
                    <button class="quantity-btn decrease-quantity">-</button>
                    <span class="current-quantity">${item.quantity}</span>
                    <button class="quantity-btn increase-quantity">+</button>
                    <button class="delete-item-btn" data-id="${item.id}">Delete</button>
                </div>
            </div>
            <p class="cart-item-total">$${itemTotal.toFixed(2)}</p>
        `;
        cartContainer.appendChild(cartItemDiv);
    });

    cartTotalElement.textContent = `$${total.toFixed(2)}`;
};

// --- 5. INITIALIZATION & EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', async () => {
    // Load existing items from Firebase
    await loadCart();

    // Add to Cart Buttons
    const addToCartButtons = document.querySelectorAll('.add-to-cart');
    addToCartButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            const card = button.closest('.product-card');

            if (card) {
                const id = card.dataset.id;
                const name = card.dataset.name;
                const price = parseFloat(card.dataset.price);
                const image = card.dataset.image;

                const existingItem = shoppingCart.find(item => item.id === id);

                if (existingItem) {
                    existingItem.quantity++;
                } else {
                    shoppingCart.push({ id, name, price, image, quantity: 1 });
                }

                updateCartCounter();
                await saveCart(); // Ensure it's saved to the cloud
                alert(`${name} added to cart!`);
            }
        });
    });

    // Cart Page Controls (Increase/Decrease/Delete)
    const cartContainer = document.getElementById('cart-container');
    if (cartContainer) {
        cartContainer.addEventListener('click', async (event) => {
            const target = event.target;
            const controls = target.closest('.quantity-controls') || target.closest('.delete-item-btn');
            if (!controls) return;

            const productId = controls.dataset.id || controls.closest('.quantity-controls')?.dataset.id;
            
            if (target.classList.contains('increase-quantity')) {
                await changeQuantity(productId, 1);
            } else if (target.classList.contains('decrease-quantity')) {
                await changeQuantity(productId, -1);
            } else if (target.classList.contains('delete-item-btn')) {
                await deleteItem(productId);
            }
        });
    }

    // Checkout Button
    const checkoutBtn = document.getElementById('checkout-button');
    checkoutBtn?.addEventListener('click', async () => {
        if (shoppingCart.length > 0) {
            alert(`Proceeding to checkout for ${document.getElementById('cart-total').textContent}.`);
            shoppingCart = [];
            await saveCart();
            updateCartCounter();
            renderCart();
        }
    });
});

// Function to fetch products from Firebase and display them
const displayProducts = async () => {
    const grid = document.getElementById('products-grid');
    if (!grid) return; // Only run on products.html

    grid.innerHTML = "<p>Loading products...</p>";

    try {
        const snapshot = await db.collection("products").orderBy("createdAt", "desc").get();
        grid.innerHTML = ""; // Clear loading message

        snapshot.forEach(doc => {
            const p = doc.data();
            const productHTML = `
                <div class="product-card" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-image="${p.image}">
                    <img src="${p.image}" alt="${p.name}">
                    <h3>${p.name}</h3>
                    <p>$${p.price.toFixed(2)}</p>
                    <a href="#" class="cta-button add-to-cart">Add to Cart</a>
                </div>
            `;
            grid.innerHTML += productHTML;
        });

        // RE-ATTACH Event Listeners because these cards are new
        attachAddToCartListeners();

    } catch (error) {
        console.error("Error fetching products:", error);
    }
};

// Helper to attach listeners to dynamic buttons
const attachAddToCartListeners = () => {
    const btns = document.querySelectorAll('.add-to-cart');
    btns.forEach(btn => {
        btn.onclick = async (e) => {
            e.preventDefault();
            const card = btn.closest('.product-card');
            // ... (Your existing Add to Cart logic here) ...
            // TIP: Move your Add to Cart logic into a reusable function!
        };
    });
};
// Jstz Signer Extension Types and Functions
const JstzSignerEventTypes = {
    SIGN: 'JSTZ_SIGN_REQUEST_TO_EXTENSION',
    GET_ADDRESS: 'JSTZ_GET_ADDRESS_REQUEST_TO_EXTENSION',
    SIGN_RESPONSE: 'JSTZ_SIGN_RESPONSE_FROM_EXTENSION',
    GET_ADDRESS_RESPONSE: 'JSTZ_GET_ADDRESS_RESPONSE_FROM_EXTENSION'
};

// Check if Jstz extension is installed
function isJstzExtensionInstalled() {
    try {
        return typeof window.jstzCallSignerExtension === 'function';
    } catch (e) {
        return false;
    }
}

// Check if Jstz SDK is loaded
function isJstzSdkLoaded() {
    return !!window.JstzClient;
}

// Request address from Jstz wallet extension
async function getJstzAddress() {
    if (!isJstzExtensionInstalled()) {
        throw new Error('Jstz wallet extension not installed. Please install from: https://github.com/jstz-dev/dev-wallet/releases');
    }

    try {
        const response = await window.jstzCallSignerExtension({
            type: JstzSignerEventTypes.GET_ADDRESS
        });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to get Jstz address: ${error.message}`);
    }
}

// Request signature from Jstz wallet extension
async function requestJstzSignature(operation) {
    if (!isJstzExtensionInstalled()) {
        throw new Error('Jstz wallet extension not installed');
    }

    try {
        const response = await window.jstzCallSignerExtension({
            type: JstzSignerEventTypes.SIGN,
            content: operation
        });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to sign Jstz operation: ${error.message}`);
    }
}

// Inject and poll Jstz operation
async function injectJstzOperation(operation, signature, rpcUrl = 'https://privatenet.jstz.info') {
    const response = await fetch(`${rpcUrl}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            inner: operation,
            signature: signature
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jstz injection failed: ${errorText}`);
    }

    return await response.json();
}

// Poll for operation result
async function pollJstzOperation(operationHash, rpcUrl = 'https://privatenet.jstz.info', maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${rpcUrl}/operations/${operationHash}`);
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'applied' || result.status === 'failed') {
                    return result;
                }
            }
        } catch (e) {
            // Continue polling
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Operation polling timeout');
}

// CLI Modal functions
let pendingCliCommand = null;

function showCLIModal(command, description = null) {
    const modal = document.getElementById('cli-modal');
    const commandEl = document.getElementById('cli-modal-command');
    const descEl = document.getElementById('cli-modal-description');

    commandEl.textContent = command;
    if (description) {
        descEl.textContent = description;
    }

    modal.style.display = 'flex';
    modal.style.opacity = '0';
    setTimeout(() => modal.style.opacity = '1', 10);
}

// Show a discreet button instead of auto-popup
function offerCliCommand(command, description = null) {
    pendingCliCommand = command;

    // Log a clickable link instead of auto-showing modal
    log(`<button onclick="showCLIModal('${command.replace(/'/g, "\\'")}', '${(description || 'Run this command in your terminal:').replace(/'/g, "\\'")}'); return false;" class="inline-flex items-center gap-1 px-2 py-1 rounded bg-jstz-accent/20 hover:bg-jstz-accent/30 text-jstz-accent text-xs font-semibold transition"><i class="fa-solid fa-terminal"></i> Show CLI Command</button>`, 'info');
}

function closeCLIModal() {
    const modal = document.getElementById('cli-modal');
    modal.style.opacity = '0';
    setTimeout(() => modal.style.display = 'none', 300);
}

function copyCLICommand() {
    const commandEl = document.getElementById('cli-modal-command');
    const btnText = document.getElementById('copy-cli-btn-text');

    navigator.clipboard.writeText(commandEl.textContent).then(() => {
        btnText.textContent = 'Copied!';
        setTimeout(() => btnText.textContent = 'Copy', 2000);
    });
}

// ========================================
// CLI VERIFICATION MODAL (Skip Jstz Verification)
// ========================================

let pendingCliVerifyHashlock = null;

function showCliVerifyModal(hashLock) {
    pendingCliVerifyHashlock = hashLock;

    const modal = document.getElementById('cli-verify-modal');
    const commandEl = document.getElementById('cli-verify-command');
    const confirmBtn = document.getElementById('cli-verify-confirm-btn');

    // Build the CLI command
    const command = `jstz run "jstz://${CONFIG.jstz.contractAddress}/swap/${hashLock}" -n privatenet -m GET`;
    commandEl.textContent = command;

    // Reset checkboxes
    document.getElementById('cli-check-1').checked = false;
    document.getElementById('cli-check-2').checked = false;
    document.getElementById('cli-check-3').checked = false;
    confirmBtn.disabled = true;

    // Add event listeners to checkboxes
    ['cli-check-1', 'cli-check-2', 'cli-check-3'].forEach(id => {
        document.getElementById(id).onchange = updateCliVerifyButton;
    });

    // Show modal with animation
    modal.style.display = 'flex';
    modal.style.opacity = '0';
    setTimeout(() => modal.style.opacity = '1', 10);
}

function updateCliVerifyButton() {
    const check1 = document.getElementById('cli-check-1').checked;
    const check2 = document.getElementById('cli-check-2').checked;
    const check3 = document.getElementById('cli-check-3').checked;
    const confirmBtn = document.getElementById('cli-verify-confirm-btn');

    confirmBtn.disabled = !(check1 && check2 && check3);
}

function closeCliVerifyModal() {
    const modal = document.getElementById('cli-verify-modal');
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.style.display = 'none';
        pendingCliVerifyHashlock = null;
    }, 300);
}

function copyCliVerifyCommand() {
    const commandEl = document.getElementById('cli-verify-command');
    const btnText = document.getElementById('copy-cli-verify-text');

    navigator.clipboard.writeText(commandEl.textContent).then(() => {
        btnText.textContent = 'Copied!';
        setTimeout(() => btnText.textContent = 'Copy', 2000);
    });
}

function confirmCliVerification() {
    if (!pendingCliVerifyHashlock) return;

    const hashLock = pendingCliVerifyHashlock;
    closeCliVerifyModal();

    // Mark as verified (user takes responsibility)
    state.aliceSwapVerified = true;
    state.aliceSwapChain = 'jstz';
    state.currentSwapId = hashLock;
    state.hash = hashLock;

    // Update UI
    const aliceDetails = document.getElementById('alice-swap-details');
    const actionBtn = document.getElementById('main-action-btn');
    const verifyJstzBtn = document.getElementById('verify-jstz-btn');
    const skipVerifyBtn = document.getElementById('skip-verify-btn');

    aliceDetails.classList.remove('hidden');
    document.getElementById('alice-swap-amount').textContent = '(Verified via CLI)';
    document.getElementById('alice-swap-expiry').textContent = '(Check CLI output)';
    document.getElementById('alice-swap-sender').textContent = '(Check CLI output)';
    document.getElementById('alice-swap-chain').textContent = 'Jstz';
    document.getElementById('alice-swap-status').textContent = 'CLI VERIFIED';
    document.getElementById('alice-swap-status').className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400';

    // Hide verification buttons
    if (verifyJstzBtn) verifyJstzBtn.classList.add('hidden');
    if (skipVerifyBtn) skipVerifyBtn.classList.add('hidden');

    // Enable the main action button
    actionBtn.disabled = false;
    actionBtn.innerHTML = `<span>Match Swap</span><i class="fa-solid fa-arrow-right"></i>`;
    actionBtn.className = "w-full py-4 rounded-xl text-lg font-bold bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-black shadow-lg flex items-center justify-center gap-2 transition-all";

    log(`✅ Swap marked as verified via CLI`, 'success');
    log(`⚠️ You are responsible for verifying the swap details`, 'warning');
}

// ========================================
// SUCCESS CELEBRATION MODAL
// ========================================

function showSuccessModal(config) {
    const {
        type = 'success', // 'claim', 'refund', 'initiate', 'match', 'success'
        title = 'Success!',
        subtitle = 'Your transaction was successful',
        amount = null,
        token = 'XTZ',
        chain = 'etherlink',
        txHash = null,
        hashlock = null,
        recipient = null,
        sender = null,
        explorerUrl = null,
        extraActions = [] // [{label, onClick, primary}]
    } = config;

    const modal = document.getElementById('success-modal');
    const content = document.getElementById('success-modal-content');
    const iconEl = document.getElementById('success-modal-icon');
    const titleEl = document.getElementById('success-modal-title');
    const subtitleEl = document.getElementById('success-modal-subtitle');
    const detailsEl = document.getElementById('success-modal-details');
    const actionsEl = document.getElementById('success-modal-actions');

    // Configure icon based on type
    const icons = {
        claim: { icon: 'fa-gift', gradient: 'from-ether-green to-emerald-500', shadow: 'shadow-ether-green/50' },
        refund: { icon: 'fa-rotate-left', gradient: 'from-gray-600 to-gray-800', shadow: 'shadow-gray-500/50' },
        initiate: { icon: 'fa-lock', gradient: 'from-ether-green to-teal-600', shadow: 'shadow-ether-green/50' },
        match: { icon: 'fa-handshake', gradient: 'from-emerald-500 to-green-600', shadow: 'shadow-emerald-500/50' },
        success: { icon: 'fa-check', gradient: 'from-ether-green to-emerald-600', shadow: 'shadow-ether-green/50' }
    };

    const iconConfig = icons[type] || icons.success;
    iconEl.className = `w-20 h-20 rounded-full bg-gradient-to-br ${iconConfig.gradient} flex items-center justify-center mx-auto mb-6 shadow-lg ${iconConfig.shadow} animate-bounce-once`;
    iconEl.innerHTML = `<i class="fa-solid ${iconConfig.icon} text-4xl text-black"></i>`;

    // Update border color
    content.className = content.className.replace(/border-\w+-500\/30/g, '');
    const borderColors = {
        claim: 'border-ether-green/30',
        refund: 'border-gray-500/30',
        initiate: 'border-ether-green/30',
        match: 'border-emerald-500/30',
        success: 'border-ether-green/30'
    };
    content.classList.add(borderColors[type] || borderColors.success);

    // Set title and subtitle
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;

    // Build details HTML
    let detailsHtml = '<div class="space-y-3">';

    if (amount) {
        detailsHtml += `
            <div class="flex items-center justify-between">
                <span class="text-gray-400 text-sm">Amount</span>
                <span class="text-white font-bold text-lg">${amount} ${token}</span>
            </div>
        `;
    }

    if (chain) {
        const chainConfig = {
            etherlink: { name: 'Etherlink', icon: '⟠', color: 'text-ether-green' },
            jstz: { name: 'Jstz', icon: '🟡', color: 'text-jstz-accent' }
        };
        const c = chainConfig[chain] || { name: chain, icon: '🔗', color: 'text-white' };
        detailsHtml += `
            <div class="flex items-center justify-between">
                <span class="text-gray-400 text-sm">Network</span>
                <span class="${c.color} font-semibold">${c.icon} ${c.name}</span>
            </div>
        `;
    }

    if (recipient) {
        const shortRecipient = recipient.length > 16 ? `${recipient.substring(0, 8)}...${recipient.slice(-6)}` : recipient;
        detailsHtml += `
            <div class="flex items-center justify-between">
                <span class="text-gray-400 text-sm">Recipient</span>
                <span class="text-white font-mono text-sm">${shortRecipient}</span>
            </div>
        `;
    }

    if (sender) {
        const shortSender = sender.length > 16 ? `${sender.substring(0, 8)}...${sender.slice(-6)}` : sender;
        detailsHtml += `
            <div class="flex items-center justify-between">
                <span class="text-gray-400 text-sm">Sender</span>
                <span class="text-white font-mono text-sm">${shortSender}</span>
            </div>
        `;
    }

    if (hashlock) {
        const shortHash = hashlock.length > 20 ? `${hashlock.substring(0, 10)}...${hashlock.slice(-8)}` : hashlock;
        detailsHtml += `
            <div class="flex items-center justify-between">
                <span class="text-gray-400 text-sm">Swap ID</span>
                <span class="text-white font-mono text-xs bg-black/30 px-2 py-1 rounded">${shortHash}</span>
            </div>
        `;
    }

    if (txHash) {
        const shortTx = txHash.length > 20 ? `${txHash.substring(0, 10)}...${txHash.slice(-8)}` : txHash;
        detailsHtml += `
            <div class="flex items-center justify-between">
                <span class="text-gray-400 text-sm">Tx Hash</span>
                <span class="text-white font-mono text-xs bg-black/30 px-2 py-1 rounded">${shortTx}</span>
            </div>
        `;
    }

    detailsHtml += '</div>';

    // Add explorer link if available
    if (explorerUrl) {
        detailsHtml += `
            <a href="${explorerUrl}" target="_blank" class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition py-2 border-t border-white/5">
                <i class="fa-solid fa-external-link"></i>
                View on Explorer
            </a>
        `;
    }

    detailsEl.innerHTML = detailsHtml;

    // Build action buttons
    let actionsHtml = `
        <button onclick="closeSuccessModal()" class="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-semibold transition-all border border-white/10">
            Close
        </button>
    `;

    extraActions.forEach(action => {
        if (action.primary) {
            actionsHtml += `
                <button onclick="${action.onClick}; closeSuccessModal();" class="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r ${iconConfig.gradient} text-white font-bold shadow-lg transition-all hover:opacity-90">
                    ${action.label}
                </button>
            `;
        } else {
            actionsHtml += `
                <button onclick="${action.onClick}" class="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all">
                    ${action.label}
                </button>
            `;
        }
    });

    actionsEl.innerHTML = actionsHtml;

    // Show modal with animation
    modal.style.display = 'flex';
    modal.style.opacity = '0';
    content.style.transform = 'scale(0.9)';

    setTimeout(() => {
        modal.style.opacity = '1';
        content.style.transform = 'scale(1)';
    }, 10);

    // Play celebration sound
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdX6IkJGNhXx2cWxqaWxwdXuBho2TmJygnpyZlZGNiYaBfXp4d3Z2dnh6fICEiIyQk5aYmpubnJybnJubmpmYl5aVlJOSkZCPjo2Mi4qJiIeHh4eHh4iIiYqLjI2Oj5CRkpOUlZaXl5iZmZqam5ubnJycnJycnJycnJycm5ubm5qampmZmJiXl5aWlZWUlJOTkpKRkZCQj4+OjY2MjIuLioqJiYiIh4eGhoWFhYWEhISEhISEhIODg4OCgoKCgoKBgYGBgYCAgICAgH9/f39/f39/fn5+fn5+fn5+fn5+fn5+fn5+fn5+');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    const content = document.getElementById('success-modal-content');

    modal.style.opacity = '0';
    content.style.transform = 'scale(0.9)';

    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

/* Tailwind configuration for the Atomic Swap UI */
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                ether: {
                    green: '#80F89B', // Etherlink Brand Green (approx)
                    dark: '#020202',
                    card: '#111111',
                    border: '#222222',
                    text: '#e2e8f0'
                },
                jstz: {
                    accent: '#FFD700' // Gold/Yellow for Jstz
                }
            },
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'monospace'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                }
            }
        }
    }
};

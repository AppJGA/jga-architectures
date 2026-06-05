export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all cursor-pointer border-0'

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }

  const variants = {
    primary: { backgroundColor: 'var(--jga-orange)', color: 'white' },
    secondary: { backgroundColor: 'var(--jga-orange-light)', color: 'var(--jga-orange)' },
    ghost: { backgroundColor: 'transparent', color: 'var(--jga-beige)' },
    danger: { backgroundColor: '#FEE2E2', color: '#B8412C' },
  }

  return (
    <button
      className={`${base} ${sizes[size]} ${className}`}
      style={variants[variant]}
      {...props}
    >
      {children}
    </button>
  )
}

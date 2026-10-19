// A reusable glassmorphism card component
const GlassyCard = ({ children, style = {} }) => {
  const baseStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '22px',
    backdropFilter: 'blur(12px)',
    boxShadow: 'var(--shadow)',
    ...style,
  };
  return <div style={baseStyle}>{children}</div>;
};

export default GlassyCard;

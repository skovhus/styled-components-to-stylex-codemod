import React from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  icon: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    backgroundColor: 'currentColor',
    maskSize: 'contain',
  },
  iconInButton: {
    width: '20px',
    height: '20px',
    opacity: 0.8,
  },
  iconInButtonHover: {
    opacity: 1,
    transform: 'scale(1.1)',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#BF4F74',
    color: 'white',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: '4px',
  },
});

export const App = () => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div>
      <button
        {...stylex.props(styles.button)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <span
          {...stylex.props(
            styles.icon,
            styles.iconInButton,
            isHovered && styles.iconInButtonHover
          )}
        />
        Click me
      </button>
    </div>
  );
};

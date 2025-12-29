import React from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  button: {
    backgroundColor: '#BF4F74',
    color: 'white',
    padding: '8px 16px',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: '4px',
  },
  card: {
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  },
  inputBase: {
    padding: '8px 12px',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderRadius: '4px',
    fontSize: '14px',
  },
  inputNormal: {
    borderColor: '#ccc',
  },
  inputError: {
    borderColor: 'red',
  },
  inputFocusNormal: {
    borderColor: '#BF4F74',
    outline: 'none',
  },
  inputFocusError: {
    borderColor: 'red',
    outline: 'none',
  },
  baseButton: {
    fontSize: '14px',
    cursor: 'pointer',
  },
  extendedButton: {
    backgroundColor: '#4F74BF',
    color: 'white',
    padding: '8px 16px',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: '4px',
  },
});

function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...stylex.props(styles.button)} {...props}>
      {children}
    </button>
  );
}
Button.displayName = 'PrimaryButton';

function Card({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...stylex.props(styles.card)} {...props}>
      {children}
    </div>
  );
}
Card.displayName = 'Card';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  hasError?: boolean;
}

function Input({ hasError, ...props }: InputProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <input
      {...stylex.props(
        styles.inputBase,
        hasError ? styles.inputError : styles.inputNormal,
        isFocused && (hasError ? styles.inputFocusError : styles.inputFocusNormal)
      )}
      onFocus={(e) => {
        setIsFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        props.onBlur?.(e);
      }}
      {...props}
    />
  );
}
Input.displayName = 'StyledInput';

function ExtendedButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...stylex.props(styles.baseButton, styles.extendedButton)} {...props}>
      {children}
    </button>
  );
}
ExtendedButton.displayName = 'ExtendedButton';

export const App = () => (
  <div>
    <Button>Primary Button</Button>
    <Card>
      <p>Card content</p>
    </Card>
    <Input placeholder="Normal input" />
    <Input hasError placeholder="Error input" />
    <ExtendedButton>Extended Button</ExtendedButton>
  </div>
);

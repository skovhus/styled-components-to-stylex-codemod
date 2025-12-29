import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  staticBox: {
    backgroundColor: '#BF4F74',
    height: '50px',
    width: '50px',
    borderRadius: '4px',
  },
  dynamicBox: {
    borderRadius: '4px',
  },
});

function StaticBox() {
  return <div {...stylex.props(styles.staticBox)} />;
}

function DynamicBox({ $background = '#BF4F74', $size = '50px' }: { $background?: string; $size?: string }) {
  return (
    <div
      {...stylex.props(styles.dynamicBox)}
      style={{ backgroundColor: $background, height: $size, width: $size }}
    />
  );
}

export const App = () => (
  <div>
    <StaticBox />
    <DynamicBox $background="mediumseagreen" $size="100px" />
  </div>
);
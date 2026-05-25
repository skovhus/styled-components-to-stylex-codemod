import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-q86QP9LE.js";var n=e(),r=t.div`
  overflow: hidden;
  height: 0;
  opacity: 0;
  transition-property: opacity, height;

  &[data-open="true"] {
    height: auto;
    opacity: 1;
  }

  @supports (interpolate-size: allow-keywords) {
    interpolate-size: allow-keywords;

    @supports (height: calc-size(auto, size)) {
      height: calc-size(auto, size * 0);

      &[data-open="true"] {
        height: calc-size(auto, size);
      }
    }
  }
`,i=()=>(0,n.jsx)(r,{"data-open":`true`,children:(0,n.jsx)(`div`,{children:`Open content`})});export{i as App};
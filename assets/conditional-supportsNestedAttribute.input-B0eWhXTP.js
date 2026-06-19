import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-iDZAbuMf.js";var n=e(),r=t.div`
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
`,i=t.div`
  color: black;

  @supports (color: color(display-p3 1 0 0)) {
    &:hover {
      color: color(display-p3 1 0 0);
    }

    color: blue;
  }
`,a=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{"data-open":`true`,children:(0,n.jsx)(`div`,{children:`Open content`})}),(0,n.jsx)(i,{children:`Hover order`})]});export{a as App};
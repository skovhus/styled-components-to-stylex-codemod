import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{t}from"./react-lJqMpIaC.js";import{i as n,r}from"./styled-components.browser.esm-Dy4oaG3m.js";t();var i=e(),a=n.img`
  border-radius: 50%;
  width: 50px;
  height: 50px;

  ${e=>e.$disabled?r`
          filter: opacity(0.65);
        `:``}
  ${e=>e.$isInactive?r`
          box-shadow: 0 0 0 1px ${e.theme.color.bgSub};
          background-color: ${e.theme.color.bgSub};
          filter: opacity(0.5) grayscale(1);
        `:``};
`,o=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`}),(0,i.jsx)(`br`,{}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0,$isInactive:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$isInactive:!0})]});export{o as App};
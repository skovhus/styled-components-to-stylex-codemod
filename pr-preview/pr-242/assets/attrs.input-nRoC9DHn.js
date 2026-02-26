import{c as o,j as e}from"./index-BCejkBkR.js";const l=t=>{const{column:b,center:m,focusIndex:a,...r}=t;return e.jsx("div",{"data-focus-index":a,...r})},n=o.input.attrs(t=>({type:"text",size:t.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${t=>t.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,s=o("input").attrs(t=>({"data-1p-ignore":t.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,c=o(l).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${t=>t.loaded?0:1};
`,d=o(l).attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,i=o(l).attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,x=o(l).attrs(t=>({tabIndex:t.focusIndex??0}))`
  overflow-y: auto;
`,p=o.div.attrs(t=>({tabIndex:t.tabIndex??0}))`
  overflow: auto;
`,u=o(l).attrs(t=>({column:t.column??!0}))`
  align-items: center;
`,h=()=>e.jsxs(e.Fragment,{children:[e.jsx(n,{$small:!0,placeholder:"Small"}),e.jsx(n,{placeholder:"Normal"}),e.jsx(n,{$padding:"2em",placeholder:"Padded"}),e.jsx(s,{placeholder:"Text input"}),e.jsx(c,{loaded:!1,children:"Content"}),e.jsx(d,{children:"Scrollable content"}),e.jsx(i,{gutter:"stable",children:"Type alias scrollable"}),e.jsx(x,{focusIndex:5,children:"Focus content"}),e.jsx(p,{children:"Box content"}),e.jsx(u,{children:"Aligned content"})]});export{u as AlignedFlex,h as App,c as Background,x as FocusableScroll,d as Scrollable,i as ScrollableWithType,s as TextInput};

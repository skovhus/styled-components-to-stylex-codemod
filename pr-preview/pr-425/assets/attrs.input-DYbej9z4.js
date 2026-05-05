import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n}from"./index-BJ2NpHtd.js";t();var r=e(),i=e=>{let{column:t,center:n,focusIndex:i,...a}=e;return(0,r.jsx)(`div`,{"data-focus-index":i,...a})},a=n.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,o=n(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,s=n(i).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,c=n(i).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,l=n(i).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,u=n(i).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,d=n.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,f=n(i).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,p=n.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,m=n.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,h=()=>(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(a,{$small:!0,placeholder:`Small`}),(0,r.jsx)(a,{placeholder:`Normal`}),(0,r.jsx)(a,{$padding:`2em`,placeholder:`Padded`}),(0,r.jsx)(o,{placeholder:`Text input`}),(0,r.jsx)(s,{loaded:!1,children:`Content`}),(0,r.jsx)(c,{children:`Scrollable content`}),(0,r.jsx)(l,{gutter:`stable`,children:`Type alias scrollable`}),(0,r.jsx)(u,{focusIndex:5,children:`Focus content`}),(0,r.jsx)(d,{children:`Box content`}),(0,r.jsx)(f,{children:`Aligned content`}),(0,r.jsx)(p,{children:`No wrapping text`}),(0,r.jsx)(m,{$height:50,children:`Dynamic height`})]});export{f as AlignedFlex,h as App,s as Background,u as FocusableScroll,c as Scrollable,l as ScrollableWithType,o as TextInput};
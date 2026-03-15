import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-BFw42tS8.js";e(t(),1);var i=n(),a=e=>{let{column:t,center:n,focusIndex:r,...a}=e;return(0,i.jsx)(`div`,{"data-focus-index":r,...a})},o=r.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,s=r(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,c=r(a).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>e.loaded?0:1};
`,l=r(a).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,u=r(a).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,d=r(a).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,f=r.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,p=r(a).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,m=r.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,h=r.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,g=()=>(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(o,{$small:!0,placeholder:`Small`}),(0,i.jsx)(o,{placeholder:`Normal`}),(0,i.jsx)(o,{$padding:`2em`,placeholder:`Padded`}),(0,i.jsx)(s,{placeholder:`Text input`}),(0,i.jsx)(c,{loaded:!1,children:`Content`}),(0,i.jsx)(l,{children:`Scrollable content`}),(0,i.jsx)(u,{gutter:`stable`,children:`Type alias scrollable`}),(0,i.jsx)(d,{focusIndex:5,children:`Focus content`}),(0,i.jsx)(f,{children:`Box content`}),(0,i.jsx)(p,{children:`Aligned content`}),(0,i.jsx)(m,{children:`No wrapping text`}),(0,i.jsx)(h,{$height:50,children:`Dynamic height`})]});export{p as AlignedFlex,g as App,c as Background,d as FocusableScroll,l as Scrollable,u as ScrollableWithType,s as TextInput};
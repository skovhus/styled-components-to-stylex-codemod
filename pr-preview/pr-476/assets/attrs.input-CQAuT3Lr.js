import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-B18YHxtN.js";import{l as r}from"./helpers-C1tT5xo7.js";import{t as i}from"./icon-CKFvvhU9.js";import{t as a}from"./sx-aware-component-DAf7yzPY.js";n();var o=e(),s={},c=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,o.jsx)(`div`,{"data-focus-index":r,...i})},l=e=>{let{focusIndex:t,otherAttribute:n,someAttribute:r,...i}=e;return(0,o.jsx)(`section`,{"data-focus-index":t,"data-other-attribute":n?`true`:`false`,"data-some-attribute":r?`true`:`false`,...i})},u=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,d=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,f=t(c).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,p=t(l).attrs({someAttribute:!0})`
  padding: 16px 16px;
  background-color: #f0f9ff;
`,m=t(l).attrs({someAttribute:!0})`
  padding: 12px;
  background-color: #ecfdf5;
`,h=t(l).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#1d4ed8`:`#64748b`};
`,g=t(l).attrs({someAttribute:!0})`
  padding: 10px;
  background-color: ${e=>e.tone===`success`?`#dcfce7`:`#dbeafe`};
`,_=t(l).attrs({someAttribute:!0})`
  padding: 14px;
  background-color: #fef3c7;
`,v=t(l)`
  color: ${e=>e.tone===`secondary`?`#7c2d12`:`#1e3a8a`};
`,y=t(l).attrs({someAttribute:!0})`
  padding: 6px;
  background-color: #fdf2f8;
`,b=t(l).attrs(e=>({tabIndex:e.focusIndex}))`
  color: #334155;
`,x=t(l).attrs({someAttribute:!0})`
  padding: 18px;
  background-color: #eef2ff;
`,S=t(l).attrs({otherAttribute:!0,someAttribute:!0})`
  padding: 20px;
  background-color: #f0fdf4;
`,C=t(l).attrs({someAttribute:!0})`
  padding: 22px;
  background-color: #fff7ed;
`,w=t(l).attrs({someAttribute:!0})`
  padding: 24px;
  background-color: #f8fafc;
`,T=t(c).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,E=t(c).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,D=t(c).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,O=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,k=t(c).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,A=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,j=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,M=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,N=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,P=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,F=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,I=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function L(e){let{className:t,height:n,style:r}=e;return(0,o.jsx)(F,{$height:n,className:t,style:r})}function R(e){let{children:t,className:n,size:r,style:i,variant:a}=e;return(0,o.jsx)(`button`,{className:n,"data-size":r,"data-variant":a,style:i,children:t})}var z=t(t(R).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,B=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,V=`#7c3aed`,H=t.span.attrs(()=>({style:{color:V}}))`
  font-style: italic;
`,U=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,W=t(a).attrs({sx:s,type:`button`})`
  color: #2563eb;
`,G=()=>(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(u,{$small:!0,placeholder:`Small`}),(0,o.jsx)(u,{placeholder:`Normal`}),(0,o.jsx)(u,{$padding:`2em`,placeholder:`Padded`}),(0,o.jsx)(d,{placeholder:`Text input`}),(0,o.jsx)(f,{loaded:!1,children:`Content`}),(0,o.jsx)(p,{label:`section-label`,children:`Section content`}),(0,o.jsx)(m,{label:`imported-section-label`,children:`Imported section content`}),(0,o.jsx)(h,{$active:!0,children:`Highlighted section content`}),(0,o.jsx)(g,{tone:`success`,children:`Utility section content`}),(0,o.jsx)(_,{tone:`primary`,children:`Shared attrs section content`}),(0,o.jsx)(v,{someAttribute:!1,tone:`secondary`,children:`Shared plain section content`}),(0,o.jsx)(y,{localLabel:`local-label`,children:`Imported intersection section content`}),(0,o.jsx)(b,{focusIndex:2,children:`Focus index section content`}),(0,o.jsx)(x,{label:`pick-label`,children:`Pick section content`}),(0,o.jsx)(S,{label:`multi-label`,children:`Multi imported section content`}),(0,o.jsx)(C,{localLabel:`inherited-label`,children:`Inherited section content`}),(0,o.jsx)(w,{kind:`alpha`,children:`Union section content`}),(0,o.jsx)(T,{children:`Scrollable content`}),(0,o.jsx)(E,{gutter:`stable`,children:`Type alias scrollable`}),(0,o.jsx)(D,{focusIndex:5,children:`Focus content`}),(0,o.jsx)(O,{children:`Box content`}),(0,o.jsx)(k,{children:`Aligned content`}),(0,o.jsx)(A,{children:`No wrapping text`}),(0,o.jsx)(j,{$height:50,children:`Dynamic height`}),(0,o.jsx)(M,{height:64,children:`Tile with attrs height`}),(0,o.jsx)(N,{children:`Optional height omitted`}),(0,o.jsx)(N,{height:24,children:`Optional height set`}),(0,o.jsx)(P,{children:`Mixed fallback height`}),(0,o.jsx)(L,{height:2,style:{opacity:1}}),(0,o.jsx)(I,{$height:4,children:`Fallback separator`}),(0,o.jsx)(z,{children:`Inherited attrs`}),(0,o.jsx)(B,{children:`Module scope style`}),(0,o.jsx)(H,{children:`Callback scope style`}),(0,o.jsx)(U,{title:`Attrs icon size`}),(0,o.jsx)(W,{children:`Attrs sx`})]});export{k as AlignedFlex,G as App,f as Background,b as FocusIndexSection,D as FocusableScroll,h as HighlightSection,y as ImportedIntersectionSection,m as ImportedSection,C as InheritedSection,S as MultiImportedSection,x as PickSection,T as Scrollable,E as ScrollableWithType,p as Section,_ as SharedAttrsSection,v as SharedPlainSection,d as TextInput,w as UnionSection,g as UtilitySection};
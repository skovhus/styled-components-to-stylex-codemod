import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-zsc9qT47.js";import{l as r}from"./helpers-D03g7kN6.js";import{t as i}from"./icon-CW14C64j.js";n();var a=e(),o=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,a.jsx)(`div`,{"data-focus-index":r,...i})},s=e=>{let{focusIndex:t,someAttribute:n,...r}=e;return(0,a.jsx)(`section`,{"data-focus-index":t,"data-some-attribute":n?`true`:`false`,...r})},c=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,l=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,u=t(o).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,d=t(s).attrs({someAttribute:!0})`
  padding: 16px 16px;
  background-color: #f0f9ff;
`,f=t(s).attrs({someAttribute:!0})`
  padding: 12px;
  background-color: #ecfdf5;
`,p=t(s).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#1d4ed8`:`#64748b`};
`,m=t(s).attrs({someAttribute:!0})`
  padding: 10px;
  background-color: ${e=>e.tone===`success`?`#dcfce7`:`#dbeafe`};
`,h=t(s).attrs({someAttribute:!0})`
  padding: 14px;
  background-color: #fef3c7;
`,g=t(s)`
  color: ${e=>e.tone===`secondary`?`#7c2d12`:`#1e3a8a`};
`,_=t(s).attrs({someAttribute:!0})`
  padding: 6px;
  background-color: #fdf2f8;
`,v=t(s).attrs(e=>({tabIndex:e.focusIndex}))`
  color: #334155;
`,y=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,b=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,x=t(o).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,S=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,C=t(o).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,w=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,T=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,E=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,D=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,O=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,k=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,A=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function j(e){let{className:t,height:n,style:r}=e;return(0,a.jsx)(k,{$height:n,className:t,style:r})}function M(e){let{children:t,className:n,size:r,style:i,variant:o}=e;return(0,a.jsx)(`button`,{className:n,"data-size":r,"data-variant":o,style:i,children:t})}var N=t(t(M).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,P=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,F=`#7c3aed`,I=t.span.attrs(()=>({style:{color:F}}))`
  font-style: italic;
`,L=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,R=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(c,{$small:!0,placeholder:`Small`}),(0,a.jsx)(c,{placeholder:`Normal`}),(0,a.jsx)(c,{$padding:`2em`,placeholder:`Padded`}),(0,a.jsx)(l,{placeholder:`Text input`}),(0,a.jsx)(u,{loaded:!1,children:`Content`}),(0,a.jsx)(d,{label:`section-label`,children:`Section content`}),(0,a.jsx)(f,{label:`imported-section-label`,children:`Imported section content`}),(0,a.jsx)(p,{$active:!0,children:`Highlighted section content`}),(0,a.jsx)(m,{tone:`success`,children:`Utility section content`}),(0,a.jsx)(h,{tone:`primary`,children:`Shared attrs section content`}),(0,a.jsx)(g,{someAttribute:!1,tone:`secondary`,children:`Shared plain section content`}),(0,a.jsx)(_,{localLabel:`local-label`,children:`Imported intersection section content`}),(0,a.jsx)(v,{focusIndex:2,children:`Focus index section content`}),(0,a.jsx)(y,{children:`Scrollable content`}),(0,a.jsx)(b,{gutter:`stable`,children:`Type alias scrollable`}),(0,a.jsx)(x,{focusIndex:5,children:`Focus content`}),(0,a.jsx)(S,{children:`Box content`}),(0,a.jsx)(C,{children:`Aligned content`}),(0,a.jsx)(w,{children:`No wrapping text`}),(0,a.jsx)(T,{$height:50,children:`Dynamic height`}),(0,a.jsx)(E,{height:64,children:`Tile with attrs height`}),(0,a.jsx)(D,{children:`Optional height omitted`}),(0,a.jsx)(D,{height:24,children:`Optional height set`}),(0,a.jsx)(O,{children:`Mixed fallback height`}),(0,a.jsx)(j,{height:2,style:{opacity:1}}),(0,a.jsx)(A,{$height:4,children:`Fallback separator`}),(0,a.jsx)(N,{children:`Inherited attrs`}),(0,a.jsx)(P,{children:`Module scope style`}),(0,a.jsx)(I,{children:`Callback scope style`}),(0,a.jsx)(L,{title:`Attrs icon size`})]});export{C as AlignedFlex,R as App,u as Background,v as FocusIndexSection,x as FocusableScroll,p as HighlightSection,_ as ImportedIntersectionSection,f as ImportedSection,y as Scrollable,b as ScrollableWithType,d as Section,h as SharedAttrsSection,g as SharedPlainSection,l as TextInput,m as UtilitySection};
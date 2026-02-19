import styled from "styled-components";

const Link = ({
  className,
  children,
  href,
}: {
  className?: string;
  children: React.ReactNode;
  href: string;
}) => (
  <a className={className} href={href}>
    {children}
  </a>
);

const StyledLink = styled(Link)`
  color: #bf4f74;
  font-weight: bold;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

export const App = () => <StyledLink href="https://example.com">Visit Example</StyledLink>;

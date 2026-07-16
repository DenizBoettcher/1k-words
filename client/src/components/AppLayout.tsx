import { ReactNode } from 'react';
import { Container } from '@mantine/core';
import TopNav from './TopNav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      <Container size="md" py="xl">
        {children}
      </Container>
    </>
  );
}

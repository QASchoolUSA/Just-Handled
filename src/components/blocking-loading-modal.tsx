import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export default function BlockingLoadingModal({ isOpen, title }: { isOpen: boolean, title: string }) {
    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-[425px] [&>button]:hidden pointer-events-none">
                <DialogHeader>
                    <DialogTitle className="flex flex-col items-center text-center gap-4 py-8">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <span className="text-xl">{title}</span>
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        Please wait while we process your file. Do not close this window.
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}

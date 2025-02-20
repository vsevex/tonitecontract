export const runMethod = async (mainFunction: () => Promise<void>) => {
    try {
        await mainFunction();
    } catch (error) {
        console.error('Error occured: ', error);
    }
};
